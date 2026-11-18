const mongoose = require('mongoose');

const picklistItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  sku: String,
  barcode: String,
  salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  orderItemId: { type: mongoose.Schema.Types.ObjectId },
  requestedQty: { type: Number, default: 0 },
  pickedQty: { type: Number, default: 0 },
});

// A picklist is a purely physical-progress document: stock already left the
// ledger when the sale was created, so nothing here ever mutates Inventory or
// Product — completing a picklist only writes pickedQty back onto the sales
// order lines.
const picklistSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  picklistNumber: {
    type: String,
    required: true,
  },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  salesOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' }],
  orderNumbers: [String],
  status: {
    type: String,
    enum: ['open', 'in_progress', 'picked', 'cancelled'],
    default: 'open',
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [picklistItemSchema],
  startedAt: Date,
  completedAt: Date,
  notes: String,
}, {
  timestamps: true,
});

// Numbering scoped per tenant, same as SalesOrder/PurchaseOrder/Return.
picklistSchema.index({ tenantId: 1, picklistNumber: 1 }, { unique: true });

module.exports = mongoose.model('Picklist', picklistSchema);
