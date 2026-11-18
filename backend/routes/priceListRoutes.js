const express = require('express');
const router = express.Router();
const {
  getPriceLists, getPriceList, createPriceList, updatePriceList, deletePriceList,
} = require('../controllers/priceListController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

// All roles can READ price lists (the POS needs them to price a sale);
// only admin/manager can shape them.
router.route('/')
  .get(getPriceLists)
  .post(authorize('admin', 'manager'), createPriceList);

router.route('/:id')
  .get(validateObjectIdParam('id'), getPriceList)
  .put(validateObjectIdParam('id'), authorize('admin', 'manager'), updatePriceList)
  .delete(validateObjectIdParam('id'), authorize('admin'), deletePriceList);

module.exports = router;
