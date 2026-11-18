const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  initiatePesapalPayment,
  pesapalIPN,
  pesapalCallback,
  pesapalPosNotification,
  verifyPesapalTransaction,
  checkPesapalStatus,
  registerIPN,
  getRegisteredIPNs,
  cancelPesapalOrder,
} = require('../controllers/pesapalController');

// ═══════════════════════════════════════════════════════════════════════════════
// E-COMMERCE API 3.0 ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// IPN Management (admin/debug)
router.post('/register-ipn', protect, registerIPN);
router.get('/ipn-list', protect, getRegisteredIPNs);

// Submit Order Request — Cashier initiates Pesapal checkout
router.post('/initiate', protect, initiatePesapalPayment);

// IPN Webhook — Pesapal sends payment status notifications here (public, no auth)
router.get('/ipn', pesapalIPN);
router.post('/ipn', pesapalIPN);

// Callback — Customer redirected back after payment (public)
router.get('/callback', pesapalCallback);

// Transaction Status Polling — Frontend polls for payment completion
router.get('/status/:transactionId', protect, checkPesapalStatus);

// Cancel Order
router.post('/cancel', protect, cancelPesapalOrder);

// ═══════════════════════════════════════════════════════════════════════════════
// WIRELESS POS TERMINAL ROUTES (Physical Devices)
// ═══════════════════════════════════════════════════════════════════════════════

// Endpoint 1: Transaction Notification from Pesapal POS Terminal (public)
router.post('/pos/notification', pesapalPosNotification);

// Endpoint 2: Transaction Verification (public/protected)
router.post('/pos/verify', verifyPesapalTransaction);

module.exports = router;
