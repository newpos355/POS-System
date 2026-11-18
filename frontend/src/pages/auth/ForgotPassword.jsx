import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AuthAPI } from '../../services/api';
import './auth.css';

const ForgotPassword = () => {
  const [step, setStep] = useState(1); // 1: Send code, 2: Reset password with code
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();

  const handleRequestCode = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setSubmitting(true);
    try {
      const res = await AuthAPI.forgotPassword({ email });
      if (res.data?.success) {
        // SECURITY: The reset code is ONLY sent to the user's email.
        // It must never be read from the API response or pre-filled into the form.
        toast.success('If your email is registered, a 6-digit code has been sent to your inbox. Check your email.');
        setStep(2);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Something went wrong. Please try again.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!code || !newPassword || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setSubmitting(true);
    try {
      const res = await AuthAPI.resetPassword({ email, code, newPassword });
      if (res.data?.success) {
        toast.success('Password reset successfully! You can now log in.');
        navigate('/login');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to reset password. Invalid or expired code.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-icon-green"></div>
          <h2>{step === 1 ? 'Forgot Password' : 'Reset Password'}</h2>
          <p>
            {step === 1
              ? 'Enter your registered email to receive a 6-digit reset code'
              : 'Enter the code sent to your email and choose a new password'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleRequestCode} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Sending Request...' : 'Get Reset Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                disabled
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="code">6-Digit Reset Code</label>
              <input
                type="text"
                id="code"
                placeholder="Check your email for the code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                autoComplete="one-time-code"
                style={{ letterSpacing: '6px', fontSize: '20px', textAlign: 'center', fontWeight: 700 }}
                required
              />
              <small style={{ color: '#64748B', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                📧 The code was sent to <strong>{email}</strong>. Check your inbox (and spam folder).
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Updating Password...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="auth-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
          {step === 2 && (
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#16A34A', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => setStep(1)}
            >
              ← Change Email
            </button>
          )}
          <p><Link to="/login">Back to Login</Link></p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
