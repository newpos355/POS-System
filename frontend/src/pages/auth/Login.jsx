import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import './auth.css';

const API = import.meta.env.VITE_API_URL || '/api';

const Login = () => {
  const [tab, setTab] = useState('email'); // 'email' | 'whatsapp'

  // Shared business email (required for cashiers/managers)
  const [businessEmail, setBusinessEmail] = useState('');

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // WhatsApp OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [otpTenantId, setOtpTenantId] = useState(null); // tenant scope for verifyOTP
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // ── Email login ────────────────────────────────────────────────────────────
  const validateEmail = (emailStr) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,15}$/;
    if (!emailRegex.test(emailStr.trim())) return false;
    const blockedDomains = [
      'test.com', 'example.com', 'fake.com', 'mailinator.com', 'tempmail.com',
      '10minutemail.com', 'trashmail.com', 'yopmail.com', 'dispostable.com',
      'guerrillamail.com', 'sharklasers.com', 'getnada.com', 'binkmail.com',
      'throwawaymail.com', 'temp-mail.org', 'fakeinbox.com', 'abc.com', 'xyz.com', 'asdf.com',
    ];
    const domain = emailStr.trim().toLowerCase().split('@')[1];
    if (blockedDomains.includes(domain)) return false;
    return true;
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { toast.error('Please enter your email and password.'); return; }
    if (!validateEmail(email)) { toast.error('Please enter a valid email address.'); return; }
    if (password.length < 6) { toast.error('Password must be at least 6 characters.'); return; }

    setSubmitting(true);
    try {
      // businessEmail is optional for admins (who log in with their own unique email)
      // but required for cashiers / managers who share an email across tenants.
      const userData = await login(email.trim().toLowerCase(), password, businessEmail.trim() || undefined);
      toast.success(`Welcome back, ${userData?.name || 'User'}!`);
    } catch (err) {
      toast.error(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── SMS OTP ───────────────────────────────────────────────────────────
  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!phone.trim()) { toast.error('Please enter your registered phone number.'); return; }

    setSendingOtp(true);
    try {
      const res = await fetch(`${API}/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          // Pass businessEmail so the backend can scope to the correct tenant
          businessEmail: businessEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send OTP.');
      setOtpPhone(data.phone);
      setOtpTenantId(data.tenantId || null); // store tenantId for verifyOTP
      setOtpSent(true);
      toast.success('Security code sent! Please check your SMS inbox.');
    } catch (err) {
      toast.error(err.message || 'Failed to send OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length < 4) { toast.error('Please enter the 6-digit OTP received via SMS.'); return; }

    setVerifyingOtp(true);
    try {
      const res = await fetch(`${API}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: otpPhone,
          otp: otp.trim(),
          // Pass tenantId echoed from sendOTP so verifyOTP scopes correctly
          tenantId: otpTenantId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Invalid OTP.');

      // Store token in sessionStorage (tab-isolated) + localStorage (persistent login)
      sessionStorage.setItem('token', data.data.token);
      sessionStorage.setItem('user', JSON.stringify(data.data));
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data));
      toast.success(`Welcome back, ${data.data.name}!`);
      window.location.href = '/dashboard';
    } catch (err) {
      toast.error(err.message || 'OTP verification failed.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-icon-green"></div>
          <h2>Welcome Back</h2>
          <p>Log in to your POS Platform account</p>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex', background: '#F1F5F9', borderRadius: '10px',
          padding: '4px', marginBottom: '24px', gap: '4px',
        }}>
          <button
            type="button"
            onClick={() => { setTab('email'); setOtpSent(false); }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: '8px', border: 'none',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
              background: tab === 'email' ? '#fff' : 'transparent',
              color: tab === 'email' ? '#1E293B' : '#64748B',
              boxShadow: tab === 'email' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            📧 Email &amp; Password
          </button>
          <button
            type="button"
            onClick={() => { setTab('whatsapp'); setOtpSent(false); }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: '8px', border: 'none',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
              background: tab === 'whatsapp' ? '#0EA5E9' : 'transparent',
              color: tab === 'whatsapp' ? '#fff' : '#64748B',
              boxShadow: tab === 'whatsapp' ? '0 1px 4px rgba(14,165,233,0.4)' : 'none',
            }}
          >
            📱 SMS OTP
          </button>
        </div>

        {/* ── SHARED: Business Email Field ──────────────────────────────────── */}
        {/* Cashiers & managers MUST enter the admin's store email to scope their  */}
        {/* login to the correct tenant. Admins can leave this blank.             */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label htmlFor="businessEmail" style={{ fontWeight: 600, fontSize: '13px', color: '#374151', marginBottom: '6px', display: 'block' }}>
            🏪 Business Email <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(required for cashiers / managers)</span>
          </label>
          <input
            type="email"
            id="businessEmail"
            placeholder="store@yourbusiness.com"
            value={businessEmail}
            onChange={(e) => setBusinessEmail(e.target.value)}
            autoComplete="off"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '10px',
              border: '1.5px solid #E2E8F0', fontSize: '14px', outline: 'none',
              background: '#F8FAFC', boxSizing: 'border-box', transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = '#16A34A'}
            onBlur={e => e.target.style.borderColor = '#E2E8F0'}
          />
          <small style={{ color: '#64748B', fontSize: '11px', marginTop: '4px', display: 'block' }}>
            Your store admin will give you this email. Leave blank if you are the store admin.
          </small>
        </div>

        {/* EMAIL LOGIN FORM */}
        {tab === 'email' && (
          <form onSubmit={handleEmailLogin} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="email">Your Email Address</label>
              <input
                type="email" id="email"
                placeholder="yourname@email.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" required
              />
            </div>

            <div className="form-group" style={{ position: 'relative' }}>
              <label htmlFor="password">Password</label>
              <input
                type={showPassword ? 'text' : 'password'} id="password"
                placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required
              />
              <button
                type="button" onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 12, top: 36,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748B', fontSize: '13px', fontWeight: 600,
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="auth-options">
              <label className="remember-me">
                <input type="checkbox" defaultChecked />
                <span>Remember me</span>
              </label>
              <Link to="/forgot-password" className="forgot-link">Forgot Password?</Link>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Logging in...' : 'Log In'}
            </button>
          </form>
        )}

        {/* WHATSAPP OTP FORM */}
        {tab === 'whatsapp' && !otpSent && (
          <form onSubmit={handleSendOTP} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="phone">Your Phone Number</label>
              <input
                type="tel" id="phone"
                placeholder="+92 318 0505202"
                value={phone} onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel" required
              />
              <small style={{ color: '#64748B', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Include country code (e.g. +92 for Pakistan, +256 for Uganda)
              </small>
            </div>

            <button type="submit" disabled={sendingOtp}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                background: '#25D366', color: '#fff', fontSize: '15px', fontWeight: 700,
                cursor: sendingOtp ? 'not-allowed' : 'pointer', opacity: sendingOtp ? 0.7 : 1,
                marginTop: '8px', transition: 'all 0.2s',
              }}
            >
              {sendingOtp ? 'Sending OTP...' : '📱 Send SMS OTP'}
            </button>
          </form>
        )}

        {tab === 'whatsapp' && otpSent && (
          <form onSubmit={handleVerifyOTP} className="auth-form" noValidate>
            <div style={{
              background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px',
              padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '20px' }}>💬</span>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '13px', color: '#0369A1' }}>OTP Sent!</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#0369A1' }}>Check SMS on {otpPhone}</p>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="otp">Enter OTP Code</label>
              <input
                type="text" id="otp"
                placeholder="Enter 6-digit OTP"
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6} autoComplete="one-time-code"
                style={{ letterSpacing: '6px', fontSize: '22px', textAlign: 'center', fontWeight: 700 }}
                required
              />
            </div>

            <button type="submit" disabled={verifyingOtp}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                background: '#25D366', color: '#fff', fontSize: '15px', fontWeight: 700,
                cursor: verifyingOtp ? 'not-allowed' : 'pointer', opacity: verifyingOtp ? 0.7 : 1,
                marginTop: '8px', transition: 'all 0.2s',
              }}
            >
              {verifyingOtp ? 'Verifying...' : '✅ Verify & Login'}
            </button>

            <button type="button"
              onClick={() => { setOtpSent(false); setOtp(''); setOtpTenantId(null); }}
              style={{
                width: '100%', padding: '10px', borderRadius: '10px',
                background: 'none', border: '1px solid #E2E8F0',
                color: '#64748B', fontSize: '13px', cursor: 'pointer', marginTop: '8px',
              }}
            >
              ← Change Number
            </button>
          </form>
        )}

        <div className="auth-footer" style={{ marginTop: '16px' }}>
          <p>Don't have an account? <Link to="/register">Register your business</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
