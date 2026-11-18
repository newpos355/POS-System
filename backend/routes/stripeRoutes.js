const express = require('express');
const router = express.Router();
const {
  createCheckoutSession,
  verifySession,
  getSubscription,
  getPlans,
} = require('../controllers/stripeController');
const { protect, optionalAuth } = require('../middleware/auth');

// Public — list plans info
router.get('/plans', getPlans);

// Create checkout session (optional auth — works for both logged in & new users)
router.post('/create-checkout-session', optionalAuth, createCheckoutSession);

// Verify completed session & update tenant plan (requires auth)
router.post('/verify-session', protect, verifySession);

// Get current subscription status
router.get('/subscription', protect, getSubscription);

module.exports = router;
