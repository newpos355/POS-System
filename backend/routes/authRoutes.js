const express = require('express');
const router  = express.Router();
const {
  register, login, getMe, updateProfile, changePassword, forgotPassword, resetPassword,
  exchangeImpersonationCode,
} = require('../controllers/authController');
const { sendOTP, verifyOTP } = require('../controllers/otpController');
const { protect } = require('../middleware/auth');
const {
  loginLimiter, forgotPasswordLimiter, otpLimiter, registerLimiter, resetPasswordLimiter, otpVerifyLimiter,
} = require('../middleware/rateLimiter');
const {
  validateLogin, validateRegister, validateForgotPassword, validateResetPassword,
} = require('../middleware/validate');

// ── Public routes (rate-limited + validated) ──────────────────────────────────
router.post('/register',         registerLimiter,        validateRegister,        register);
router.post('/login',            loginLimiter,           validateLogin,           login);
router.post('/forgot-password',  forgotPasswordLimiter,  validateForgotPassword,  forgotPassword);
router.post('/reset-password',   resetPasswordLimiter,   validateResetPassword,   resetPassword);

// ── OTP routes (rate-limited) ─────────────────────────────────────────────────
router.post('/otp/send',    otpLimiter,       sendOTP);
router.post('/otp/verify',  otpVerifyLimiter, verifyOTP);

// ── Impersonation handoff (public by design — see utils/impersonationStore.js) ─
router.post('/impersonate/exchange', exchangeImpersonationCode);

// ── Protected routes ──────────────────────────────────────────────────────────
router.get('/me',                protect, getMe);
router.put('/profile',           protect, updateProfile);
router.put('/change-password',   protect, changePassword);

module.exports = router;
