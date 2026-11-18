const mongoose = require('mongoose');

const stockAdjustmentSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
  },
  adjustmentType: {
    type: String,
    enum: ['increase', 'decrease'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  previousQuantity: Number,
  newQuantity: Number,
  reason: {
    type: String,
    enum: ['damage', 'loss', 'correction', 'return', 'expired', 'other'],
    required: true,
  },
  notes: String,
  adjustedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
