/* Expense model for P&L tracking */
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  category: {
    type: String,
    enum: ['Rent', 'Salaries', 'Utilities', 'Marketing', 'Transport', 'Supplies', 'Maintenance', 'Insurance', 'Taxes', 'Other'],
    default: 'Other',
  },
  description: { type: String, required: true },
  amount:      { type: Number, required: true, min: 0 },
  date:        { type: Date, default: Date.now },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:       { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
