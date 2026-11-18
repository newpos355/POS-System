const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  },
  name: String,
  quantity: Number,
  unitCost: Number,
  total: Number,
  // When this PO line was generated from a sales order line (conversion,
  // backorder replenishment, or dropship) these link back to the exact SO
  // line so receiving can allocate arrived stock to the right waiting order.
  sourceSalesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  sourceOrderItemId: { type: mongoose.Schema.Types.ObjectId },
});

const receivedItemSchema = new mongoose.Schema({
  productId: mongoose.Schema.Types.ObjectId,
  quantity: Number,
  receivedAt: Date,
});

const purchaseOrderSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  poNumber: {
    type: String,
    required: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
  },
  items: [poItemSchema],
  subtotal: Number,
  tax: {
    type: Number,
    default: 0,
  },
  grandTotal: Number,
  status: {
    type: String,
    enum: ['draft', 'ordered', 'partial', 'received', 'cancelled'],
    default: 'draft',
  },
  receivedItems: [receivedItemSchema],
  notes: String,
  expectedDate: Date,
  receivedAt: Date,

  // ── Vendor payment tracking (feeds the Payables report) ─────────────────
  // paidAmount accumulates via recordPOPayment (conditional so it can never
  // exceed grandTotal); paymentStatus is derived from it.
  paidAmount: {
    type: Number,
    default: 0,
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid',
  },
  payments: [{
    method: String,
    amount: Number,
    reference: String,
    at: { type: Date, default: Date.now },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],

  // ── Provenance ───────────────────────────────────────────────────────────
  // How this PO came to exist. 'dropship' POs are special at receive time:
  // the goods never enter local stock (vendor ships straight to the
  // customer), so receiving marks the linked SO lines shipped instead of
  // incrementing Inventory/Product.
  sourceType: {
    type: String,
    enum: ['manual', 'sales_order', 'backorder', 'dropship'],
    default: 'manual',
  },
  sourceSalesOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' }],
  dropshipCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  shipToAddress: {
    name: String,
    phone: String,
    address: String,
    city: String,
    notes: String,
  },
}, {
  timestamps: true,
});

// Scoped per tenant instead of globally unique — see the matching note in
// models/SalesOrder.js. Same migration note applies: a database created
// before this change still has the old bare unique index on `poNumber` and
// needs it dropped (`db.purchaseorders.dropIndex('poNumber_1')`) first.
purchaseOrderSchema.index({ tenantId: 1, poNumber: 1 }, { unique: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
