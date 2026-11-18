const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── GET VENDORS ───────────────────────────────────────────────────────────────
exports.getVendors = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { tenantId: req.tenantId };
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { company: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [total, vendors] = await Promise.all([
      Vendor.countDocuments(query),
      Vendor.find(query).sort('-createdAt').skip(skip).limit(limit),
    ]);

    res.json({
      success: true,
      data: vendors,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET VENDOR ────────────────────────────────────────────────────────────────
exports.getVendor = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const vendor = await Vendor.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }
    res.json({ success: true, data: vendor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE VENDOR ─────────────────────────────────────────────────────────────
exports.createVendor = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const vendor = await Vendor.create({ ...req.body, tenantId: req.tenantId });
    res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE VENDOR ─────────────────────────────────────────────────────────────
exports.updateVendor = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    // See customerController.updateCustomer for why tenantId/_id are stripped.
    const { tenantId, _id, ...safeBody } = req.body;
    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      safeBody,
      { new: true, runValidators: true }
    );
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }
    res.json({ success: true, data: vendor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE VENDOR ─────────────────────────────────────────────────────────────
exports.deleteVendor = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    await Vendor.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
