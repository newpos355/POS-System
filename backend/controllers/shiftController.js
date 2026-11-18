const mongoose = require('mongoose');
const ShiftSession = require('../models/ShiftSession');
const SalesOrder = require('../models/SalesOrder');
const Return = require('../models/Return');
const Branch = require('../models/Branch');
const { nextDocNumber } = require('../utils/docNumber');
const { logActivity } = require('../utils/audit');

const isDbConnected = () => mongoose.connection.readyState === 1;

const MOBILE_METHODS = ['Airtel Money', 'MTN MoMo', 'Pesapal Uganda', 'MOBILE_MONEY', 'mobile_money'];

// ─── Derive the session's cash position from the books ───────────────────────
// Everything is recomputed from the sales/returns recorded during the
// session window (never accumulated as sales happen), so the drawer
// expectation always agrees with the sales ledger.
async function computeShiftTotals(session, tenantId, until) {
  const windowEnd = until || new Date();
  const totals = {
    salesCount: 0, salesTotal: 0,
    cashSales: 0, cardSales: 0, mobileSales: 0, creditSales: 0, storeCreditSales: 0,
    cashCollections: 0, cashRefunds: 0, cashIn: 0, cashOut: 0,
  };

  // Pass 1 — sales this cashier rang up during the session.
  const sales = await SalesOrder.find({
    tenantId,
    cashierId: session.cashierId,
    status: { $ne: 'voided' },
    createdAt: { $gte: session.openedAt, $lte: windowEnd },
  }).select('paymentMethod paymentDetails payments grandTotal');

  for (const s of sales) {
    const pd = s.paymentDetails || {};
    const grand = Number(s.grandTotal) || 0;
    const storeCredit = Number(pd.storeCreditApplied) || 0;
    const net = Math.max(0, grand - storeCredit);
    const method = s.paymentMethod || 'Cash';
    totals.salesCount += 1;
    totals.salesTotal += grand;
    totals.storeCreditSales += storeCredit;

    if (method === 'Split') {
      // Tender lines say exactly what came in by which method; the drawer
      // keeps the cash tender minus the change handed back.
      const cashTender = Number(pd.cashReceived) || 0;
      const change = Number(pd.changeReturned) || 0;
      totals.cashSales += Math.max(0, cashTender - change);
      for (const p of s.payments || []) {
        if (p.method === 'Card') totals.cardSales += Number(p.amount) || 0;
        else if (MOBILE_METHODS.includes(p.method)) totals.mobileSales += Number(p.amount) || 0;
      }
    } else if (['Cash', 'cash', 'CASH'].includes(method)) {
      totals.cashSales += net;
    } else if (['Card', 'card', 'CARD'].includes(method)) {
      totals.cardSales += net;
    } else if (MOBILE_METHODS.includes(method)) {
      totals.mobileSales += net;
    } else if (['Credit Sale', 'Pay Later', 'credit', 'CREDIT'].includes(method)) {
      // Upfront portion is cash in the drawer; later collections are counted
      // by pass 2 from payments[] (amountPaid is $inc'd by recordPayment, so
      // subtract recorded payments to isolate the true upfront amount).
      const recorded = (s.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const upfront = Math.max(0, (Number(pd.amountPaid) || 0) - recorded);
      totals.cashSales += upfront;
      totals.creditSales += Number(pd.balanceDue) || 0;
    }
    // 'Store Credit' full-cover sales add no drawer cash.
  }

  // Pass 2 — cash collected against due bills during the session (any bill,
  // whenever it was created). Split sales are excluded: their payments[] are
  // checkout tenders already counted above.
  const collectionSales = await SalesOrder.find({
    tenantId,
    paymentMethod: { $ne: 'Split' },
    payments: {
      $elemMatch: {
        receivedBy: session.cashierId,
        method: 'Cash',
        at: { $gte: session.openedAt, $lte: windowEnd },
      },
    },
  }).select('payments');
  for (const s of collectionSales) {
    for (const p of s.payments || []) {
      if (p.method === 'Cash' && String(p.receivedBy) === String(session.cashierId)
        && p.at >= session.openedAt && p.at <= windowEnd) {
        totals.cashCollections += Number(p.amount) || 0;
      }
    }
  }

  // Pass 3 — cash refunds this cashier paid out of the drawer.
  const refunds = await Return.find({
    tenantId,
    processedBy: session.cashierId,
    refundMethod: 'Cash',
    status: 'completed',
    type: { $ne: 'cancellation' },
    createdAt: { $gte: session.openedAt, $lte: windowEnd },
  }).select('totalAmount');
  totals.cashRefunds = refunds.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);

  // Pass 4 — manual drawer movements.
  for (const m of session.movements || []) {
    if (m.type === 'cash_in') totals.cashIn += Number(m.amount) || 0;
    else totals.cashOut += Number(m.amount) || 0;
  }

  const round = (n) => Math.round(n * 100) / 100;
  for (const k of Object.keys(totals)) totals[k] = round(totals[k]);
  const expectedCash = round(
    (Number(session.openingFloat) || 0)
    + totals.cashSales + totals.cashCollections + totals.cashIn
    - totals.cashRefunds - totals.cashOut
  );
  return { totals, expectedCash };
}

// ─── OPEN SHIFT ───────────────────────────────────────────────────────────────
exports.openShift = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const openingFloat = Number(req.body.openingFloat);
    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
      return res.status(400).json({ success: false, message: 'Opening float must be zero or a positive amount.' });
    }

    const existing = await ShiftSession.findOne({
      tenantId: req.tenantId, cashierId: req.user._id, status: 'open',
    });
    if (existing) {
      return res.status(409).json({ success: false, message: `You already have an open shift (${existing.sessionNumber}) — close it first.`, data: existing });
    }

    let branchId = req.body.branchId;
    if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) {
      const branch = await Branch.findOne({ tenantId: req.tenantId, isDefault: true })
        || await Branch.findOne({ tenantId: req.tenantId });
      branchId = branch?._id;
    }

    const sessionNumber = await nextDocNumber(ShiftSession, req.tenantId, 'SES', 'sessionNumber');
    const session = await ShiftSession.create({
      tenantId: req.tenantId,
      sessionNumber,
      branchId,
      cashierId: req.user._id,
      openingFloat,
    });

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'shift_opened', entity: 'ShiftSession', entityId: session._id,
      description: `Opened shift ${sessionNumber} (float ${openingFloat.toLocaleString()})`,
    });

    res.status(201).json({ success: true, data: session });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'You already have an open shift — close it first.' });
    }
    console.error('Open shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CURRENT SHIFT (with live expected-cash) ──────────────────────────────────
exports.getCurrentShift = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const session = await ShiftSession.findOne({
      tenantId: req.tenantId, cashierId: req.user._id, status: 'open',
    });
    if (!session) {
      return res.json({ success: true, data: null });
    }
    const { totals, expectedCash } = await computeShiftTotals(session, req.tenantId);
    res.json({ success: true, data: { ...session.toObject(), liveTotals: totals, liveExpectedCash: expectedCash } });
  } catch (error) {
    console.error('Get current shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── RECORD A CASH MOVEMENT ───────────────────────────────────────────────────
exports.addMovement = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const amount = Number(req.body.amount);
    const type = req.body.type;
    if (!['cash_in', 'cash_out'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Movement type must be cash_in or cash_out.' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Movement amount must be a positive number.' });
    }

    const session = await ShiftSession.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, cashierId: req.user._id, status: 'open' },
      {
        $push: {
          movements: {
            type, amount,
            reason: req.body.reason ? String(req.body.reason).slice(0, 200) : undefined,
            by: req.user._id,
          },
        },
      },
      { new: true }
    );
    if (!session) {
      return res.status(404).json({ success: false, message: 'Open shift not found (is it yours, and still open?).' });
    }
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CLOSE SHIFT ──────────────────────────────────────────────────────────────
// Conditional on status:'open' so a double-click can't close (and snapshot)
// twice. The over/short is counted-minus-expected: negative = drawer short.
exports.closeShift = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const countedCash = Number(req.body.countedCash);
    if (!Number.isFinite(countedCash) || countedCash < 0) {
      return res.status(400).json({ success: false, message: 'Counted cash must be zero or a positive amount.' });
    }

    const session = await ShiftSession.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, cashierId: req.user._id, status: 'open' },
      { $set: { status: 'closed', closedAt: new Date(), closedBy: req.user._id } },
      { new: true }
    );
    if (!session) {
      return res.status(404).json({ success: false, message: 'Open shift not found (already closed?).' });
    }

    const { totals, expectedCash } = await computeShiftTotals(session, req.tenantId, session.closedAt);
    session.totals = totals;
    session.expectedCash = expectedCash;
    session.countedCash = countedCash;
    session.overShort = Math.round((countedCash - expectedCash) * 100) / 100;
    if (req.body.notes) session.notes = String(req.body.notes).slice(0, 500);
    await session.save();

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'shift_closed', entity: 'ShiftSession', entityId: session._id,
      description: `Closed shift ${session.sessionNumber} \u2014 counted ${countedCash.toLocaleString()} vs expected ${expectedCash.toLocaleString()}`,
    });

    res.json({ success: true, data: session });
  } catch (error) {
    console.error('Close shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── SHIFT HISTORY ────────────────────────────────────────────────────────────
// Cashiers see their own sessions; admin/manager see everyone's.
exports.getShifts = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const query = { tenantId: req.tenantId };
    const role = (req.user.role || '').toLowerCase();
    if (!['admin', 'manager'].includes(role)) {
      query.cashierId = req.user._id;
    } else if (req.query.cashierId && mongoose.Types.ObjectId.isValid(req.query.cashierId)) {
      query.cashierId = req.query.cashierId;
    }
    if (req.query.status) query.status = req.query.status;

    const shifts = await ShiftSession.find(query)
      .populate('cashierId', 'name')
      .populate('branchId', 'name')
      .sort('-openedAt')
      .limit(parseInt(req.query.limit) || 100);

    res.json({ success: true, data: shifts });
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
