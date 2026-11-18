import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import './auth.css';

const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { test: (p) => /[0-9]/.test(p), label: 'One number' },
];

const Register = () => {
  const [formData, setFormData] = useState({
    businessName: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();

  const validateEmail = (emailStr) => {
    if (!emailStr || typeof emailStr !== 'string') return { valid: false, message: 'Email address is required.' };
    const trimmed = emailStr.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,15}$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, message: 'Please enter a valid email address (e.g. name@company.com).' };
    }
    const [localPart, domain] = trimmed.split('@');
    if (localPart.length < 2) return { valid: false, message: 'Email username is too short.' };
    const blockedDomains = [
      'test.com', 'example.com', 'fake.com', 'mailinator.com', 'tempmail.com',
      '10minutemail.com', 'trashmail.com', 'yopmail.com', 'dispostable.com',
      'guerrillamail.com', 'sharklasers.com', 'getnada.com', 'binkmail.com',
      'throwawaymail.com', 'temp-mail.org', 'fakeinbox.com', 'abc.com', 'xyz.com', 'asdf.com'
    ];
    if (blockedDomains.includes(domain)) {
      return { valid: false, message: 'Disposable or test email domains are not allowed. Use a real email address.' };
    }
    return { valid: true };
  };

  const validatePassword = (pass) => {
    return PASSWORD_RULES.every((r) => r.test(pass));
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Field completeness
    if (!formData.businessName.trim() || !formData.fullName.trim() || !formData.email.trim() || !formData.password) {
      toast.error('Please fill in all required fields.');
      return;
    }

    // Email validation
    const emailCheck = validateEmail(formData.email);
    if (!emailCheck.valid) {
      toast.error(emailCheck.message);
      return;
    }

    // Password strength
    if (!validatePassword(formData.password)) {
      toast.error('Password must be at least 8 characters with uppercase, lowercase, and a number.');
      return;
    }

    // Confirm password match
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        businessName: formData.businessName.trim(),
        name: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        password: formData.password,
      });
      toast.success('Account created successfully! Please select a subscription plan.');
    } catch (err) {
      const serverMsg = err.message || 'Registration failed. Please try again.';
      toast.error(serverMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const pwdRulesMetCount = PASSWORD_RULES.filter(r => r.test(formData.password)).length;
  const pwdStrengthPercent = (pwdRulesMetCount / PASSWORD_RULES.length) * 100;
  const pwdStrengthColor =
    pwdRulesMetCount <= 1 ? '#ef4444' :
    pwdRulesMetCount === 2 ? '#f59e0b' :
    pwdRulesMetCount === 3 ? '#3b82f6' : '#16a34a';

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-icon-green"></div>
          <h2>Create Your Account</h2>
          <p>Start managing your retail business today</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="businessName">Business Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="text"
              id="businessName"
              name="businessName"
              placeholder="Your Store / Company Name"
              value={formData.businessName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="fullName">Your Full Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              placeholder="John Doe"
              value={formData.fullName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Business Email Address <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="yourname@company.com"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone Number <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 'normal' }}>(Optional - for SMS OTP Login)</span></label>
            <input
              type="tel"
              id="phone"
              name="phone"
              placeholder="+256 700 000000 or +92 300 000000"
              value={formData.phone}
              onChange={handleChange}
              autoComplete="tel"
            />
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label htmlFor="password">Password <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              name="password"
              placeholder="Min 8 chars, uppercase, number"
              value={formData.password}
              onChange={handleChange}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: 12, top: 36,
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#64748B', fontSize: '13px', fontWeight: 600,
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>

            {/* Password Strength Bar */}
            {formData.password && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%', width: `${pwdStrengthPercent}%`,
                      background: pwdStrengthColor,
                      transition: 'width 0.3s ease, background 0.3s ease',
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6 }}>
                  {PASSWORD_RULES.map((rule) => (
                    <span
                      key={rule.label}
                      style={{
                        fontSize: '11px',
                        color: rule.test(formData.password) ? '#16a34a' : '#94a3b8',
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}
                    >
                      {rule.test(formData.password) ? '✓' : '○'} {rule.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label htmlFor="confirmPassword">Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type={showConfirm ? 'text' : 'password'}
              id="confirmPassword"
              name="confirmPassword"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              style={{
                position: 'absolute', right: 12, top: 36,
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#64748B', fontSize: '13px', fontWeight: 600,
              }}
            >
              {showConfirm ? 'Hide' : 'Show'}
            </button>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: 4 }}>Passwords do not match</p>
            )}
            {formData.confirmPassword && formData.password === formData.confirmPassword && (
              <p style={{ fontSize: '12px', color: '#16a34a', marginTop: 4 }}>✓ Passwords match</p>
            )}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Creating Account...' : 'Register Store'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Already have an account? <Link to="/login">Log in</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Register;
