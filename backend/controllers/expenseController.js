const mongoose = require('mongoose');
const Expense = require('../models/Expense');

const isDbConnected = () => mongoose.connection.readyState === 1;

// GET /api/expenses
exports.getExpenses = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { from, to, category, search, page = 1, limit = 50 } = req.query;
    const query = { tenantId: req.tenantId };
    if (category) query.category = category;
    if (search) query.description = { $regex: search, $options: 'i' };
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) { const t = new Date(to); t.setHours(23,59,59,999); query.date.$lte = t; }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [total, expenses] = await Promise.all([
      Expense.countDocuments(query),
      Expense.find(query).sort('-date').skip(skip).limit(Number(limit)).populate('createdBy', 'name'),
    ]);
    res.json({ success: true, data: expenses, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/expenses
exports.createExpense = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { category, description, amount, date, notes } = req.body;
    if (!description || !amount) return res.status(400).json({ success: false, message: 'Description and amount are required.' });
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
    }
    const expense = await Expense.create({
      tenantId: req.tenantId,
      category: category || 'Other',
      description,
      amount: numericAmount,
      date: date ? new Date(date) : new Date(),
      createdBy: req.user._id,
      notes,
    });
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/expenses/:id
exports.updateExpense = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    // See customerController.updateCustomer for why tenantId/_id are stripped.
    const { tenantId, _id, ...safeBody } = req.body;
    if (safeBody.amount !== undefined) {
      const numericAmount = Number(safeBody.amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
      }
      safeBody.amount = numericAmount;
    }
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      safeBody,
      { new: true }
    );
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/expenses/:id
exports.deleteExpense = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.json({ success: true, message: 'Expense deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
