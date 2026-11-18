const express = require('express');
const router = express.Router();
const { getInventory, adjustStock, transferStock, getStockMovements, getAdjustments, repackStock, getRepacks } = require('../controllers/inventoryController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

router.use(protect);
router.use(tenantScope);

router.get('/', getInventory);
router.post('/adjust', authorize('admin', 'manager'), adjustStock);
router.post('/transfer', authorize('admin', 'manager'), transferStock);
router.get('/movements/:productId', getStockMovements);
router.get('/adjustments', getAdjustments);
router.post('/repack', authorize('admin', 'manager'), repackStock);
router.get('/repacks', getRepacks);

module.exports = router;
