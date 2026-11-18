/* Return model for processing customer returns */
const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:      String,
  sku:       String,
  quantity:  { type: Number, required: true },
  price:     Number,
  total:     Number,
});

const returnSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  returnNumber:   { type: String, required: true },
  originalSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  originalOrderNumber: String,
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  processedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName:   String,
  items:          [returnItemSchema],
  totalAmount:    { type: Number, default: 0 },
  reason: {
    type: String,
    enum: ['Defective', 'Wrong Item', 'Changed Mind', 'Damaged', 'Expired', 'Other'],
    default: 'Other',
  },
  refundMethod: {
    type: String,
    enum: ['Cash', 'Store Credit', 'Original Payment Method'],
    default: 'Cash',
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'completed', 'rejected'],
    default: 'completed',
  },
  // 'return' = customer sending items back; 'cancellation' = an unfulfilled
  // order line being called off before it ships (see salesController.cancelSaleLines).
  type: { type: String, enum: ['return', 'cancellation'], default: 'return' },
  // Defaults to true so every return document created before this field
  // existed reads as "stock already restored" — matches their actual
  // behavior (createReturn always restocked immediately) with no migration.
  stockRestored: { type: Boolean, default: true },
  restoredAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectedReason: String,
  creditNoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditNote' },
  refundPaymentId: { type: mongoose.Schema.Types.ObjectId },
  notes: String,
}, { timestamps: true });

// Same fix as SalesOrder/PurchaseOrder: returnNumber was globally unique
// while the count used to generate it was already tenant-scoped, so two
// tenants independently reaching e.g. RET-2026-0001 would collide. See the
// migration note in models/SalesOrder.js — a database from before this
// change needs its old `returnNumber_1` index dropped.
returnSchema.index({ tenantId: 1, returnNumber: 1 }, { unique: true });

module.exports = mongoose.model('Return', returnSchema);
