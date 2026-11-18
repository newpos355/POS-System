import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthAPI } from '../services/api';

const AuthContext = createContext();

// ── Session storage helpers ────────────────────────────────────────────────────
// We use ONLY sessionStorage for tenant JWT tokens. sessionStorage is
// TAB-ISOLATED by the browser spec — each tab gets its own independent copy
// that is NEVER shared with other tabs. This is what prevents session bleed
// between the super-admin portal and tenant tabs, and between two tabs logged
// in as different tenant accounts — opening a second tab is expected to start
// a fresh login, by design, not silently inherit whichever session happened to
// write to localStorage last.
//
// A sessionStorage token already survives a same-tab refresh (sessionStorage
// is only cleared when the tab/window closes), so there is no need to also
// persist the token to localStorage — doing so would let any tab on the
// origin read another tab's session, and would give an XSS payload a
// long-lived, cross-restart credential to steal instead of a tab-scoped one.
//
// Migration note: we still READ a legacy localStorage token for users who
// already have one from before this fix, so they aren't logged out by it —
// but we never WRITE one again.
const SESSION_KEY_TOKEN = 'token';
const SESSION_KEY_USER  = 'user';

const getStoredToken = () =>
  sessionStorage.getItem(SESSION_KEY_TOKEN) || localStorage.getItem(SESSION_KEY_TOKEN) || null;

const getStoredUser = () => {
  const s = sessionStorage.getItem(SESSION_KEY_USER) || localStorage.getItem(SESSION_KEY_USER);
  try { return s ? JSON.parse(s) : null; } catch { return null; }
};

const storeSession = (token, user) => {
  sessionStorage.setItem(SESSION_KEY_TOKEN, token);
  sessionStorage.setItem(SESSION_KEY_USER, JSON.stringify(user));
};

const clearSession = () => {
  sessionStorage.removeItem(SESSION_KEY_TOKEN);
  sessionStorage.removeItem(SESSION_KEY_USER);
  // Also clear any legacy localStorage copy so it can't resurrect a stale session.
  localStorage.removeItem(SESSION_KEY_TOKEN);
  localStorage.removeItem(SESSION_KEY_USER);
};
// ──────────────────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getStoredToken());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const validateToken = async () => {
      // ── Impersonation handoff ─────────────────────────────────────────────────
      // The super-admin panel opens this tab with ?impersonate_code=<opaque code>
      // instead of the real token. The code is single-use and expires in 30s —
      // it's meaningless on its own and must be exchanged server-side for the
      // actual session token, which never appears in a URL, browser history, or
      // referrer header. See backend/utils/impersonationStore.js.
      const urlParams = new URLSearchParams(window.location.search);
      const impersonateCode = urlParams.get('impersonate_code');
      if (impersonateCode) {
        // Strip the code from the URL immediately — it's single-use regardless
        // of whether the exchange below succeeds.
        window.history.replaceState({}, '', '/dashboard');
        try {
          const response = await AuthAPI.exchangeImpersonationCode(impersonateCode);
          const { token: impToken, user: impUser } = response.data.data;
          sessionStorage.setItem(SESSION_KEY_TOKEN, impToken);
          sessionStorage.setItem(SESSION_KEY_USER, JSON.stringify(impUser));
          setToken(impToken);
          setUser(impUser);
        } catch {
          // Expired/already-used code — fall through to normal (logged-out) flow
        }
        setLoading(false);
        return;
      }
      // ────────────────────────────────────────────────────────────────────────

      const storedToken = getStoredToken();
      const storedUserRaw = sessionStorage.getItem(SESSION_KEY_USER) || localStorage.getItem(SESSION_KEY_USER);

      if (!storedToken || !storedUserRaw) {
        setLoading(false);
        return;
      }

      // Legacy localStorage session from before tokens were made session-only —
      // honor it for this tab so the user isn't logged out, but don't re-write it.
      if (!sessionStorage.getItem(SESSION_KEY_TOKEN) && localStorage.getItem(SESSION_KEY_TOKEN)) {
        sessionStorage.setItem(SESSION_KEY_TOKEN, localStorage.getItem(SESSION_KEY_TOKEN));
        sessionStorage.setItem(SESSION_KEY_USER, localStorage.getItem(SESSION_KEY_USER));
        localStorage.removeItem(SESSION_KEY_TOKEN);
        localStorage.removeItem(SESSION_KEY_USER);
      }

      // Reject any fake/demo tokens immediately
      if (storedToken.startsWith('demo_token_') || storedToken.startsWith('token_')) {
        clearSession();
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const response = await AuthAPI.getMe();
        if (response.data && response.data.success) {
          const freshUser = response.data.data;
          setUser(freshUser);
          // Refresh stored user data (keep token, just update user object)
          sessionStorage.setItem(SESSION_KEY_USER, JSON.stringify(freshUser));
        }
      } catch (err) {
        // Any auth error (401, 404, 503, network) → force logout for security
        clearSession();
        setToken(null);
        setUser(null);
      }

      setLoading(false);
    };

    validateToken();
  }, []); // eslint-disable-line

  const login = useCallback(async (email, password, businessEmail) => {
    try {
      setError(null);
      const response = await AuthAPI.login({ email, password, businessEmail: businessEmail?.trim() || undefined });
      const userData = response.data.data;

      storeSession(userData.token, userData);
      setToken(userData.token);
      setUser(userData);

      const hasPlan = userData.plan && userData.plan !== 'none' && userData.plan !== 'free';
      navigate(hasPlan ? '/dashboard' : '/pricing');

      return userData;
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed';
      setError(msg);
      throw new Error(msg);
    }
  }, [navigate]);

  const register = useCallback(async (data) => {
    try {
      setError(null);
      const response = await AuthAPI.register(data);
      const userData = response.data.data;
      userData.plan = userData.plan || 'none';

      storeSession(userData.token, userData);
      setToken(userData.token);
      setUser(userData);

      // Mandatory redirection to pricing page upon registration
      navigate('/pricing');

      return userData;
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed';
      setError(msg);
      throw new Error(msg);
    }
  }, [navigate]);

  const updateUserPlan = useCallback((newPlan) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updatedUser = { ...prev, plan: newPlan };
      sessionStorage.setItem(SESSION_KEY_USER, JSON.stringify(updatedUser));
      return updatedUser;
    });
  }, []);

  // Swaps in a freshly issued token without a full re-login — used after a
  // password change, which bumps the server-side tokenVersion and would
  // otherwise invalidate this tab's own token on its very next request.
  const updateToken = useCallback((newToken) => {
    sessionStorage.setItem(SESSION_KEY_TOKEN, newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
    navigate('/login');
  }, [navigate]);

  const value = useMemo(() => ({
    user,
    token,
    loading,
    error,
    login,
    register,
    updateUserPlan,
    updateToken,
    logout,
  }), [user, token, loading, error, login, register, updateUserPlan, updateToken, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
