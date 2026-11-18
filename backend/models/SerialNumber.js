const mongoose = require('mongoose');

// One document per physical unit of a serial-tracked product. The stock
// COUNT still lives in Product.stock / Inventory like every other product —
// serial docs are the identity layer on top: which exact units are here,
// which sale took which unit. Consuming a serial at checkout uses the same
// conditional findOneAndUpdate pattern as stock (status must still be
// 'in_stock'), so two concurrent sales can't both take the same unit.
const serialNumberSchema = new mongoose.Schema({
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
  serial: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['in_stock', 'sold', 'returned', 'defective'],
    default: 'in_stock',
  },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  orderNumber: String,
  receivedAt: { type: Date, default: Date.now },
  soldAt: Date,
  notes: String,
}, {
  timestamps: true,
});

serialNumberSchema.index({ tenantId: 1, productId: 1, serial: 1 }, { unique: true });
serialNumberSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('SerialNumber', serialNumberSchema);
