const mongoose = require('mongoose');
const HeldBill = require('../models/HeldBill');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── LIST HELD BILLS ──────────────────────────────────────────────────────────
// Tenant-wide, so a bill held on one terminal can be recalled on another.
exports.getHeldBills = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const bills = await HeldBill.find({ tenantId: req.tenantId })
      .sort('-createdAt')
      .limit(100);
    res.json({ success: true, data: bills });
  } catch (error) {
    console.error('Get held bills error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── HOLD A BILL ──────────────────────────────────────────────────────────────
exports.holdBill = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { cart, label, customerId, customerName, discount, branchId } = req.body;
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ success: false, message: 'An empty cart cannot be held.' });
    }

    const bill = await HeldBill.create({
      tenantId: req.tenantId,
      branchId: branchId && mongoose.Types.ObjectId.isValid(branchId) ? branchId : undefined,
      label: label ? String(label).slice(0, 80) : undefined,
      customerId: customerId && mongoose.Types.ObjectId.isValid(customerId) ? customerId : undefined,
      customerName,
      cart,
      discount: Number(discount) || 0,
      heldBy: req.user._id,
      heldByName: req.user.name,
    });

    res.status(201).json({ success: true, data: bill });
  } catch (error) {
    console.error('Hold bill error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE (recalled or abandoned) ───────────────────────────────────────────
exports.deleteHeldBill = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const bill = await HeldBill.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Held bill not found (already recalled?).' });
    }
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
