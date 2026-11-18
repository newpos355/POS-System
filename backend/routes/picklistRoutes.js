const express = require('express');
const router = express.Router();
const {
  getPicklists, getPicklist, createPicklist, updatePickedQty,
  completePicklist, cancelPicklist,
} = require('../controllers/picklistController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

router.route('/')
  .get(getPicklists)
  .post(authorize('admin', 'manager'), createPicklist);

router.get('/:id', validateObjectIdParam('id'), getPicklist);
// Cashiers/pickers can record picking progress; completing (which writes
// back onto the sales order) and cancelling stay admin/manager.
router.put('/:id/items', validateObjectIdParam('id'), updatePickedQty);
router.put('/:id/complete', validateObjectIdParam('id'), authorize('admin', 'manager'), completePicklist);
router.put('/:id/cancel', validateObjectIdParam('id'), authorize('admin', 'manager'), cancelPicklist);

module.exports = router;
