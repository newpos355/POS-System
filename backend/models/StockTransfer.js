const mongoose = require('mongoose');

const transferItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  },
  name: String,
  quantity: Number,
});

const stockTransferSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  transferNumber: {
    type: String,
    required: true,
    unique: true,
  },
  sourceBranchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
  },
  destBranchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
  },
  items: [transferItemSchema],
  status: {
    type: String,
    enum: ['pending', 'in_transit', 'received', 'cancelled'],
    default: 'pending',
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('StockTransfer', stockTransferSchema);
