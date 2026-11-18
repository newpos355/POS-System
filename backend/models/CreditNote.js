/* Credit note model — the store-credit ledger a Return can issue against and
   a POS sale can redeem from. Gives "Store Credit" as a refund method a real
   effect instead of just being a label on the Return document. */
const mongoose = require('mongoose');

const redemptionSchema = new mongoose.Schema({
  salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  orderNumber: String,
  amount: { type: Number, required: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

const creditNoteSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  creditNoteNumber: { type: String, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: String,
  sourceType: { type: String, enum: ['return', 'cancellation', 'manual'], default: 'manual' },
  sourceReturnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Return' },
  sourceSalesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  amount: { type: Number, required: true },
  // Decremented as the note is spent at checkout; the note stays 'open'
  // until this reaches 0. Never trust a client-submitted remainingAmount —
  // it's only ever changed here via atomic $inc, same discipline as stock.
  remainingAmount: { type: Number, required: true },
  status: { type: String, enum: ['open', 'partially_redeemed', 'redeemed', 'void'], default: 'open' },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
  redemptions: [redemptionSchema],
}, { timestamps: true });

// Tenant-scoped uniqueness — same pattern as SalesOrder/PurchaseOrder/Return.
creditNoteSchema.index({ tenantId: 1, creditNoteNumber: 1 }, { unique: true });

module.exports = mongoose.model('CreditNote', creditNoteSchema);
