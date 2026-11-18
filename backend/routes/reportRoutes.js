const express = require('express');
const router = express.Router();
const { salesReport, inventoryReport, purchaseReport, profitLossReport, cashFlowReport, activityLogReport, financialStatementReport, receivablesReport, payablesReport, customReport } = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

router.use(protect);
router.use(tenantScope);

router.get('/sales', salesReport);
router.get('/inventory', inventoryReport);
router.get('/purchases', purchaseReport);
router.get('/profit-loss', authorize('admin', 'manager'), profitLossReport);
router.get('/cash-flow', authorize('admin', 'manager'), cashFlowReport);
router.get('/activity-log', authorize('admin', 'manager'), activityLogReport);
router.get('/financial-statement', authorize('admin'), financialStatementReport);
router.get('/receivables', authorize('admin', 'manager'), receivablesReport);
router.get('/payables', authorize('admin', 'manager'), payablesReport);
router.post('/custom', authorize('admin', 'manager'), customReport);

module.exports = router;
