const express = require('express');
const router  = express.Router();
const {
  createSale, getSales, getSale, voidSale, getDailySummary, cancelSaleLines,
  convertToPO, createDropshipPO, getBackorders, replenishBackorders, recordPayment,
} = require('../controllers/salesController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateCreateSale, validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

router.get('/daily-summary', getDailySummary);

// Backorder routes sit above /:id so 'backorders' is never parsed as an id.
router.get('/backorders/list', getBackorders);
router.post('/backorders/replenish', authorize('admin', 'manager'), replenishBackorders);

router.route('/')
  .get(getSales)
  .post(validateCreateSale, createSale);   // ← validate before creating

router.route('/:id')
  .get(validateObjectIdParam('id'), getSale);

router.put('/:id/void',
  validateObjectIdParam('id'),
  authorize('admin', 'manager'),
  voidSale,
);

router.post('/:id/cancel-lines',
  validateObjectIdParam('id'),
  authorize('admin', 'manager'),
  cancelSaleLines,
);

// Any signed-in role can collect a due payment (cashiers included).
router.post('/:id/record-payment',
  validateObjectIdParam('id'),
  recordPayment,
);

router.post('/:id/convert-to-po',
  validateObjectIdParam('id'),
  authorize('admin', 'manager'),
  convertToPO,
);

router.post('/:id/dropship-po',
  validateObjectIdParam('id'),
  authorize('admin', 'manager'),
  createDropshipPO,
);

module.exports = router;
