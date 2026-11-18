const mongoose = require('mongoose');
const CreditNote = require('../models/CreditNote');
const Customer = require('../models/Customer');

const isDbConnected = () => mongoose.connection.readyState === 1;

const generateCreditNoteNumber = async (tenantId) => {
  const count = await CreditNote.countDocuments({ tenantId });
  return `CN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
};

// Internal helper (not an HTTP handler) — called from returnController when a
// return reaches a terminal state with refundMethod === 'Store Credit'.
// Creates the note and credits the customer's balance atomically via $inc
// (never a read-then-write), so two returns approved concurrently for the
// same customer can't clobber each other's balance update.
async function issueFromReturn(returnDoc, userId) {
  if (!returnDoc.customerId) {
    throw new Error('Store credit requires a customer on the return.');
  }
  const creditNoteNumber = await generateCreditNoteNumber(returnDoc.tenantId);
  const note = await CreditNote.create({
    tenantId: returnDoc.tenantId,
    creditNoteNumber,
    customerId: returnDoc.customerId,
    customerName: returnDoc.customerName,
    sourceType: returnDoc.type === 'cancellation' ? 'cancellation' : 'return',
    sourceReturnId: returnDoc._id,
    sourceSalesOrderId: returnDoc.originalSaleId,
    amount: returnDoc.totalAmount,
    remainingAmount: returnDoc.totalAmount,
    status: 'open',
    issuedBy: userId,
  });
  await Customer.findOneAndUpdate(
    { _id: returnDoc.customerId, tenantId: returnDoc.tenantId },
    { $inc: { storeCreditBalance: returnDoc.totalAmount } }
  );
  return note;
}

// GET /api/credit-notes
exports.getCreditNotes = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId: req.tenantId };
    if (req.query.customerId) query.customerId = req.query.customerId;
    if (req.query.status) query.status = req.query.status;

    const [total, notes] = await Promise.all([
      CreditNote.countDocuments(query),
      CreditNote.find(query).sort('-createdAt').skip(skip).limit(Number(limit))
        .populate('customerId', 'name phone')
        .populate('sourceReturnId', 'returnNumber'),
    ]);
    res.json({ success: true, data: notes, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/credit-notes/:id
exports.getCreditNote = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const note = await CreditNote.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('customerId', 'name phone email')
      .populate('sourceReturnId', 'returnNumber')
      .populate('issuedBy', 'name');
    if (!note) return res.status(404).json({ success: false, message: 'Credit note not found.' });
    res.json({ success: true, data: note });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/credit-notes/customer/:customerId/available — used by POS to show
// what a selected customer can redeem at checkout.
exports.getAvailableForCustomer = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const notes = await CreditNote.find({
      tenantId: req.tenantId,
      customerId: req.params.customerId,
      status: { $in: ['open', 'partially_redeemed'] },
      remainingAmount: { $gt: 0 },
    }).sort('createdAt');
    const totalAvailable = notes.reduce((sum, n) => sum + n.remainingAmount, 0);
    res.json({ success: true, data: notes, totalAvailable });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/credit-notes — manual issue (admin only), not tied to a return.
exports.createCreditNote = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { customerId, customerName, amount, notes } = req.body;
    const amt = Number(amount);
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ success: false, message: 'A valid customer is required.' });
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero.' });
    }

    const creditNoteNumber = await generateCreditNoteNumber(req.tenantId);
    const note = await CreditNote.create({
      tenantId: req.tenantId,
      creditNoteNumber,
      customerId,
      customerName,
      sourceType: 'manual',
      amount: amt,
      remainingAmount: amt,
      status: 'open',
      issuedBy: req.user._id,
      notes,
    });
    await Customer.findOneAndUpdate(
      { _id: customerId, tenantId: req.tenantId },
      { $inc: { storeCreditBalance: amt } }
    );

    res.status(201).json({ success: true, data: note });
  } catch (err) {
    console.error('Create credit note error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/credit-notes/:id/void — cancels whatever is left unredeemed.
exports.voidCreditNote = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    // Conditional on current status so a double-click can't claw back the
    // customer's balance twice.
    const note = await CreditNote.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $in: ['open', 'partially_redeemed'] } },
      { $set: { status: 'void', remainingAmount: 0 } },
      { new: false } // need the pre-update remainingAmount to claw back
    );
    if (!note) {
      return res.status(404).json({ success: false, message: 'Open credit note not found (already redeemed or voided?).' });
    }
    if (note.remainingAmount > 0) {
      await Customer.findOneAndUpdate(
        { _id: note.customerId, tenantId: req.tenantId },
        { $inc: { storeCreditBalance: -note.remainingAmount } }
      );
    }
    res.json({ success: true, message: 'Credit note voided.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.issueFromReturn = issueFromReturn;
