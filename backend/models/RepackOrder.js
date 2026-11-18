const mongoose = require('mongoose');

// Records converting stock of one product into another (e.g. one 25kg sack
// repacked into 25 × 1kg packs). The stock movement itself happens through
// the same atomic reserve/release helpers as sales — this document is the
// audit trail of what was converted, when, and by whom.
const repackOrderSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  repackNumber: {
    type: String,
    required: true,
  },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  fromProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  fromName: String,
  fromQty: { type: Number, required: true, min: 1 },
  toProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  toName: String,
  toQty: { type: Number, required: true, min: 1 },
  notes: String,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

repackOrderSchema.index({ tenantId: 1, repackNumber: 1 }, { unique: true });

module.exports = mongoose.model('RepackOrder', repackOrderSchema);
