const express = require('express');
const router = express.Router();
const {
  getSerials, addSerials, updateSerialStatus, deleteSerial,
  getBatches, addBatch, updateBatch,
} = require('../controllers/trackingController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

// All roles can read (the POS serial picker needs the in-stock list);
// mutations are admin/manager.
router.route('/serials')
  .get(getSerials)
  .post(authorize('admin', 'manager'), addSerials);
router.put('/serials/:id/status', validateObjectIdParam('id'), authorize('admin', 'manager'), updateSerialStatus);
router.delete('/serials/:id', validateObjectIdParam('id'), authorize('admin', 'manager'), deleteSerial);

router.route('/batches')
  .get(getBatches)
  .post(authorize('admin', 'manager'), addBatch);
router.put('/batches/:id', validateObjectIdParam('id'), authorize('admin', 'manager'), updateBatch);

module.exports = router;
