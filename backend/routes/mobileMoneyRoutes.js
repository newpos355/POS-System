const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  initiateAirtelPayment,
  initiateMTNPayment,
  checkPaymentStatus,
  airtelCallback,
  mtnCallback,
  genericMomoCallback,
  getCountries,
} = require('../controllers/mobileMoneyController');

// Public — get supported African countries & providers
router.get('/countries', getCountries);

// Protected — initiate payments (cashier must be logged in)
router.post('/airtel/initiate', protect, initiateAirtelPayment);
router.post('/mtn/initiate', protect, initiateMTNPayment);
router.get('/status/:provider/:transactionId', protect, checkPaymentStatus);

// Public webhooks — Airtel, MTN & Third-party providers call these after payment confirmation
router.post('/airtel/callback', airtelCallback);
router.post('/mtn/callback', mtnCallback);
router.post('/momo-callback', genericMomoCallback);

module.exports = router;
