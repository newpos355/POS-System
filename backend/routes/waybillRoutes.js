const express = require('express');
const router = express.Router();
const {
  getWaybills, getWaybill, createWaybill, updateWaybill, cancelWaybill,
} = require('../controllers/waybillController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

router.route('/')
  .get(getWaybills)
  .post(authorize('admin', 'manager'), createWaybill);

router.route('/:id')
  .get(validateObjectIdParam('id'), getWaybill)
  .put(validateObjectIdParam('id'), authorize('admin', 'manager'), updateWaybill);

router.put('/:id/cancel', validateObjectIdParam('id'), authorize('admin'), cancelWaybill);

module.exports = router;
