const express = require('express');
const router = express.Router();
const { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, setCreditBlock, settleCredit } = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

router.use(protect);
router.use(tenantScope);

router.route('/')
  .get(getCustomers)
  .post(createCustomer);

router.route('/:id')
  .get(getCustomer)
  .put(updateCustomer)
  // Deleting a customer record is destructive and wipes out its credit/
  // purchase history references — restricted the same as credit management below.
  .delete(authorize('admin', 'manager'), deleteCustomer);

// Admin-only credit management
router.patch('/:id/credit-block', authorize('admin', 'manager'), setCreditBlock);
router.patch('/:id/settle-credit', authorize('admin', 'manager'), settleCredit);

module.exports = router;
