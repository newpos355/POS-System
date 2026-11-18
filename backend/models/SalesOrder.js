const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  },
  name: String,
  sku: String,
  quantity: Number,
  price: Number,
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: Number,
  // Tracks partial-line cancellation of a still-pending order (see
  // salesController.cancelSaleLines) — separate from `quantity` so the
  // original sold quantity is never mutated.
  cancelledQty: { type: Number, default: 0 },

  // ── Fulfillment tracking ──────────────────────────────────────────────────
  // How this line is sourced. 'stock' lines went through the atomic reserve
  // loop at sale time; 'backorder' lines reserved what was available and
  // recorded the shortfall; 'dropship' lines never touch local stock at all
  // (the vendor ships straight to the customer via a dropship PO).
  fulfillmentMode: {
    type: String,
    enum: ['stock', 'backorder', 'dropship'],
    default: 'stock',
  },
  // Units actually deducted from stock at sale time. Defaults are chosen so
  // documents created before this feature read correctly: an old line was
  // always fully reserved, so code treats a missing reservedQty as quantity.
  reservedQty: { type: Number, default: null },
  // Shortfall still waiting on a replenishment PO (backorder lines only).
  backorderedQty: { type: Number, default: 0 },
  // Physical fulfillment progress — pure bookkeeping, no stock effect
  // (stock already left the ledger at sale time).
  pickedQty: { type: Number, default: 0 },
  packedQty: { type: Number, default: 0 },
  shippedQty: { type: Number, default: 0 },
  returnedQty: { type: Number, default: 0 },
  // ── Unit tracking & composites ────────────────────────────────────────────
  // Serial-tracked lines: the exact serials sold (consumed atomically from
  // SerialNumber docs at checkout). Batch-tracked lines: which lots covered
  // this line, allocated FEFO server-side. Composite lines: the per-bundle
  // component recipe captured at sale time — void/cancel/return restore the
  // COMPONENTS' stock (qtyPerUnit × units), never the composite's own.
  serials: [String],
  batchesConsumed: [{
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    batchNumber: String,
    quantity: Number,
  }],
  componentsConsumed: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    qtyPerUnit: Number,
  }],
  // Vendor who dropships this line (stamped from Product.preferredVendorId).
  dropshipVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  // Back-link to the PO this line was converted into / replenished by.
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  lineStatus: {
    type: String,
    enum: ['open', 'allocated', 'picked', 'packed', 'shipped', 'cancelled', 'returned'],
    default: 'open',
  },
});

// ─── Payment Details (Dynamic per Method) ─────────────────────────────────────
const paymentDetailsSchema = new mongoose.Schema({
  // CASH
  cashReceived: Number,
  changeReturned: Number,

  // CARD (Manual Bank Terminal)
  cardAuthCode: String,
  cardLast4: String,
  cardNetwork: String, // Visa, Mastercard, Airtel Visa, MTN Visa, UnionPay

  // MOBILE MONEY (Airtel / MTN)
  momoProvider: { type: String, enum: ['MTN', 'AIRTEL'] },
  momoPhoneNumber: String,
  momoTransactionId: String, // From Third-Party API callback

  // CREDIT SALE
  amountPaid: { type: Number, default: 0 },   // partial upfront payment
  balanceDue: { type: Number, default: 0 },   // remaining balance
  balanceDueDate: { type: Date },             // due date for balance repayment

  // STORE CREDIT — how much of this sale was covered by redeeming the
  // customer's CreditNote balance. See creditRedemptions on the root schema
  // for which specific notes were spent.
  storeCreditApplied: { type: Number, default: 0 },
}, { _id: false });

const creditRedemptionSchema = new mongoose.Schema({
  creditNoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditNote' },
  creditNoteNumber: String,
  amount: Number,
}, { _id: false });

// One tender line. A single-method sale has zero or one of these; a 'Split'
// sale has one per tender (e.g. part cash + part card). recordPayment on a
// credit sale also appends here, so the full payment history of a bill lives
// in one place.
const paymentSchema = new mongoose.Schema({
  method: String,
  amount: Number,
  reference: String,
  at: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const salesOrderSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  orderNumber: {
    type: String,
    required: true,
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
  },
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
  },
  customerName: String,
  items: [orderItemSchema],
  subtotal: Number,
  totalDiscount: {
    type: Number,
    default: 0,
  },
  totalTax: {
    type: Number,
    default: 0,
  },
  grandTotal: Number,

  // ─── Payment Method & Status ─────────────────────────────────────────────
  paymentMethod: {
    type: String,
    enum: ['CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT', 'cash', 'card', 'mobile_money', 'credit', 'split',
           'Cash', 'Card', 'Airtel Money', 'MTN MoMo', 'Pesapal Uganda', 'Credit Sale', 'Pay Later',
           'Store Credit', 'STORE_CREDIT', 'Split', 'Bank Transfer'],
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'paid', 'partial', 'pending', 'unpaid', 'UNPAID', 'refunded'],
    default: 'PENDING',
  },
  paymentDetails: paymentDetailsSchema,

  payments: [paymentSchema],
  // Which CreditNote documents were spent to cover paymentDetails.storeCreditApplied.
  creditRedemptions: [creditRedemptionSchema],

  // ── Fulfillment (physical delivery) ──────────────────────────────────────
  // 'not_required' = ordinary walk-out POS sale, nothing to ship (the default
  // so every pre-existing order reads correctly with no migration).
  fulfillmentStatus: {
    type: String,
    enum: ['not_required', 'pending', 'partially_fulfilled', 'fulfilled', 'cancelled'],
    default: 'not_required',
  },
  hasBackorder: { type: Boolean, default: false },
  hasDropship: { type: Boolean, default: false },
  shippingAddress: {
    name: String,
    phone: String,
    address: String,
    city: String,
    notes: String,
  },
  status: {
    type: String,
    enum: ['completed', 'voided', 'refunded', 'pending'],
    default: 'completed',
  },
  notes: {
    type: String,
  },
  // Tenant-defined extra fields, keyed by CustomField.key.
  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // ── Idempotency key ────────────────────────────────────────────────────
  // Frontend generates a UUID per sale attempt (e.g. uuidv4()).
  // If the same key is submitted twice (retry, double-tap), the second
  // request returns the existing sale instead of creating a duplicate.
  idempotencyKey: {
    type: String,
    index: true,
    sparse: true,   // only indexed when present (not required for old records)
  },
}, {
  timestamps: true,
});

// Compound unique index: one idempotency key per tenant
salesOrderSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

// orderNumber used to be globally unique, which forced the numbering lookup
// in salesController to scan/count SalesOrder across ALL tenants on every
// single checkout (a shared platform-wide bottleneck). Scoping uniqueness to
// (tenantId, orderNumber) lets each tenant have its own SO-2026-0001 without
// collision risk, and lets the numbering query be scoped per tenant.
//
// MIGRATION NOTE for any database created before this change: it still has
// the old bare unique index on `orderNumber`. Drop it before this compound
// index can take effect — e.g. `db.salesorders.dropIndex('orderNumber_1')`.
salesOrderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });

module.exports = mongoose.model('SalesOrder', salesOrderSchema);