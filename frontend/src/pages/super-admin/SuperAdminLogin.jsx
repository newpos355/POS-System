import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthAPI } from '../../services/api';
import './SuperAdminLogin.css';

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await AuthAPI.login({ email: form.email, password: form.password });
      const userData = res.data.data;

      if (userData.role !== 'superadmin') {
        setError('Access denied. This portal is for platform super admins only.');
        setLoading(false);
        return;
      }

      // Store with a superadmin-specific key to avoid mixing with tenant sessions
      localStorage.setItem('superAdminToken', userData.token);
      localStorage.setItem('superAdminUser', JSON.stringify(userData));
      // Also set standard token so API headers work
      localStorage.setItem('token', userData.token);

      navigate('/super-admin/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sal-root">
      {/* Animated background orbs */}
      <div className="sal-bg">
        <div className="sal-orb sal-orb-1" />
        <div className="sal-orb sal-orb-2" />
        <div className="sal-orb sal-orb-3" />
      </div>

      <div className="sal-container">
        {/* Logo */}
        <div className="sal-logo">
          <div className="sal-logo-icon">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="sal-logo-text">
            <span className="sal-logo-title">POS Platform</span>
            <span className="sal-logo-sub">Super Admin Portal</span>
          </div>
        </div>

        {/* Card */}
        <div className="sal-card">
          <div className="sal-card-header">
            <h1 className="sal-heading">Platform Sign In</h1>
            <p className="sal-subheading">Restricted access — authorized personnel only</p>
          </div>

          {error && (
            <div className="sal-error-banner">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}

          <form className="sal-form" onSubmit={handleSubmit}>
            <div className="sal-form-group">
              <label className="sal-label">Email Address</label>
              <input
                id="sa-email"
                type="email"
                name="email"
                className="sal-input"
                placeholder="superadmin@posplatform.com"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="email"
              />
            </div>

            <div className="sal-form-group">
              <label className="sal-label">Password</label>
              <input
                id="sa-password"
                type="password"
                name="password"
                className="sal-input"
                placeholder="Enter your password"
                value={form.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="sal-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="sal-spinner" />
                  Authenticating...
                </>
              ) : (
                <>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign In to Admin Portal
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="sal-footer">
          Looking for the tenant portal?{' '}
          <a href="/login">Go to Tenant Login →</a>
        </p>
      </div>
    </div>
  );
}
