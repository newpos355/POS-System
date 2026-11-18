const mongoose = require('mongoose');

const movementSchema = new mongoose.Schema({
  type: { type: String, enum: ['cash_in', 'cash_out'], required: true },
  amount: { type: Number, required: true, min: 0 },
  reason: String,
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

// One cashier's drawer session: opened with a float, fed by cash sales and
// manual cash in/out movements, closed against a physical count. Expected
// cash is DERIVED (from the sales/returns recorded during the session window
// plus movements), never accumulated incrementally — so it can't drift from
// the sales ledger, and reopening/recomputing always agrees with the books.
const shiftSessionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  sessionNumber: {
    type: String,
    required: true,
  },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open',
  },
  openingFloat: { type: Number, default: 0 },
  openedAt: { type: Date, default: Date.now },
  closedAt: Date,
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  movements: [movementSchema],

  // Snapshot written at close time (see shiftController.computeShiftTotals).
  expectedCash: Number,
  countedCash: Number,
  overShort: Number,
  totals: {
    salesCount: Number,
    salesTotal: Number,
    cashSales: Number,
    cardSales: Number,
    mobileSales: Number,
    creditSales: Number,
    storeCreditSales: Number,
    cashCollections: Number,
    cashRefunds: Number,
    cashIn: Number,
    cashOut: Number,
  },
  notes: String,
}, {
  timestamps: true,
});

shiftSessionSchema.index({ tenantId: 1, sessionNumber: 1 }, { unique: true });
// At most one OPEN session per cashier — enforced at the database level so
// two tabs can't both open a drawer.
shiftSessionSchema.index(
  { tenantId: 1, cashierId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

module.exports = mongoose.model('ShiftSession', shiftSessionSchema);
