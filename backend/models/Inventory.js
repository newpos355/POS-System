const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
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
  quantity: {
    type: Number,
    default: 0,
  },
  reorderLevel: {
    type: Number,
    default: 10,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: true,
});

inventorySchema.index({ productId: 1, branchId: 1 }, { unique: true });

module.exports = mongoose.model('Inventory', inventorySchema);
