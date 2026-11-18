const express = require('express');
const router = express.Router();
const {
  getShipments, getShipment, createShipment, updateShipment,
  dispatchShipment, updateShipmentStatus, cancelShipment, markLabelPrinted,
} = require('../controllers/shipmentController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

router.route('/')
  .get(getShipments)
  .post(authorize('admin', 'manager'), createShipment);

router.route('/:id')
  .get(validateObjectIdParam('id'), getShipment)
  .put(validateObjectIdParam('id'), authorize('admin', 'manager'), updateShipment);

router.put('/:id/dispatch', validateObjectIdParam('id'), authorize('admin', 'manager'), dispatchShipment);
router.put('/:id/status', validateObjectIdParam('id'), authorize('admin', 'manager'), updateShipmentStatus);
router.put('/:id/label-printed', validateObjectIdParam('id'), markLabelPrinted);
router.delete('/:id', validateObjectIdParam('id'), authorize('admin', 'manager'), cancelShipment);

module.exports = router;
