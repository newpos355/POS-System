const express = require('express');
const router = express.Router();
const { getVendors, getVendor, createVendor, updateVendor, deleteVendor } = require('../controllers/vendorController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

router.use(protect);
router.use(tenantScope);

// Cashiers can VIEW vendors (needed to select vendor in PO etc.)
// Only admin/manager can create, update, delete
router.route('/')
  .get(getVendors)                               // all roles
  .post(authorize('admin', 'manager'), createVendor);

router.route('/:id')
  .get(getVendor)                                // all roles
  .put(authorize('admin', 'manager'), updateVendor)
  .delete(authorize('admin', 'manager'), deleteVendor);

module.exports = router;
