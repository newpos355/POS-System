const mongoose = require('mongoose');

// A parked (held) POS cart, recallable from any terminal of the tenant. No
// stock is reserved while a bill is on hold — stock is only touched when the
// recalled cart actually checks out, exactly like a cart that was never
// held. The cart is stored as the client-side snapshot (Mixed) so a recall
// restores the cashier's screen verbatim (weights, serials, prices).
const heldBillSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  label: String,
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: String,
  cart: { type: mongoose.Schema.Types.Mixed, required: true },
  discount: { type: Number, default: 0 },
  heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  heldByName: String,
}, {
  timestamps: true,
});

heldBillSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('HeldBill', heldBillSchema);
