const express = require('express');
const router = express.Router();
const {
  getTaxRates, createTaxRate, updateTaxRate, deleteTaxRate,
} = require('../controllers/taxRateController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

// All roles read (the POS needs the default rate); admin/manager shape them.
router.route('/')
  .get(getTaxRates)
  .post(authorize('admin', 'manager'), createTaxRate);

router.route('/:id')
  .put(validateObjectIdParam('id'), authorize('admin', 'manager'), updateTaxRate)
  .delete(validateObjectIdParam('id'), authorize('admin'), deleteTaxRate);

module.exports = router;
