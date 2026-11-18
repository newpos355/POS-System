const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');
const {
  getReturns, createReturn, getReturn, approveReturn, rejectReturn,
  getReturnSettings, updateReturnSettings,
} = require('../controllers/returnController');

router.use(protect);
router.use(tenantScope);

// Must come before '/:id' so 'settings' isn't parsed as an ObjectId param.
router.route('/settings')
  .get(getReturnSettings)
  .put(authorize('admin'), updateReturnSettings);

router.route('/')
  .get(getReturns)
  // Processing a return restores inventory and issues a refund — the same
  // admin/manager gate used for voiding a sale (salesRoutes.js), not open to
  // every cashier.
  .post(authorize('admin', 'manager'), createReturn);

router.route('/:id')
  .get(validateObjectIdParam('id'), getReturn);

router.put('/:id/approve', validateObjectIdParam('id'), authorize('admin', 'manager'), approveReturn);
router.put('/:id/reject', validateObjectIdParam('id'), authorize('admin', 'manager'), rejectReturn);

module.exports = router;
