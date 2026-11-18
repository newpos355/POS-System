const mongoose = require('mongoose');

// A lot/batch of a batch-tracked product: how many units of this lot remain
// and when they expire. Like SerialNumber, this is a layer on top of the
// ordinary stock count — checkout consumes batches FEFO (first expiry, first
// out) via $gte-guarded conditional updates, mirroring the stock pattern.
// Receiving the same batch number again for the same product accumulates
// into the existing document instead of erroring.
const batchSchema = new mongoose.Schema({
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
  batchNumber: {
    type: String,
    required: true,
    trim: true,
  },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  // Units of this lot still unsold. Never negative — consumption is guarded
  // by quantity: { $gte: take }.
  quantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  initialQuantity: {
    type: Number,
    default: 0,
  },
  expiryDate: Date,
  costPrice: Number,
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  notes: String,
}, {
  timestamps: true,
});

batchSchema.index({ tenantId: 1, productId: 1, batchNumber: 1 }, { unique: true });
batchSchema.index({ tenantId: 1, expiryDate: 1 });

module.exports = mongoose.model('Batch', batchSchema);
