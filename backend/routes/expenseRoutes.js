const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { getExpenses, createExpense, updateExpense, deleteExpense } = require('../controllers/expenseController');

router.use(protect);
router.use(tenantScope);

router.route('/')
  .get(getExpenses)
  .post(authorize('admin', 'manager'), createExpense);

router.route('/:id')
  .put(authorize('admin', 'manager'), updateExpense)
  .delete(authorize('admin', 'manager'), deleteExpense);

module.exports = router;
