const mongoose = require('mongoose');
const TaxRate = require('../models/TaxRate');
const Product = require('../models/Product');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── LIST TAX RATES ───────────────────────────────────────────────────────────
exports.getTaxRates = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const rates = await TaxRate.find({ tenantId: req.tenantId }).sort('rate');
    res.json({ success: true, data: rates });
  } catch (error) {
    console.error('Get tax rates error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE TAX RATE ──────────────────────────────────────────────────────────
exports.createTaxRate = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const name = String(req.body.name || '').trim();
    const rate = Number(req.body.rate);
    if (!name) return res.status(400).json({ success: false, message: 'A name is required (e.g. "VAT 18%").' });
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ success: false, message: 'Rate must be between 0 and 100 percent.' });
    }

    if (req.body.isDefault) {
      await TaxRate.updateMany({ tenantId: req.tenantId }, { $set: { isDefault: false } });
    }
    const taxRate = await TaxRate.create({
      tenantId: req.tenantId,
      name,
      rate,
      isDefault: Boolean(req.body.isDefault),
    });
    res.status(201).json({ success: true, data: taxRate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A tax rate with that name already exists.' });
    }
    console.error('Create tax rate error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE TAX RATE ──────────────────────────────────────────────────────────
// Changing the percentage also re-syncs the denormalized Product.taxRate on
// every product assigned to this rate, so existing catalog prices follow.
exports.updateTaxRate = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.rate !== undefined) {
      const rate = Number(req.body.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ success: false, message: 'Rate must be between 0 and 100 percent.' });
      }
      update.rate = rate;
    }
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);
    if (req.body.isDefault === true) {
      await TaxRate.updateMany({ tenantId: req.tenantId }, { $set: { isDefault: false } });
      update.isDefault = true;
    } else if (req.body.isDefault === false) {
      update.isDefault = false;
    }

    const taxRate = await TaxRate.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!taxRate) {
      return res.status(404).json({ success: false, message: 'Tax rate not found.' });
    }

    if (update.rate !== undefined) {
      await Product.updateMany(
        { tenantId: req.tenantId, taxRateId: taxRate._id },
        { $set: { taxRate: taxRate.rate } }
      );
    }

    res.json({ success: true, data: taxRate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A tax rate with that name already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE TAX RATE ──────────────────────────────────────────────────────────
// Products assigned to it keep their current numeric taxRate but lose the
// link (they behave like custom-rate products from then on).
exports.deleteTaxRate = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const taxRate = await TaxRate.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!taxRate) {
      return res.status(404).json({ success: false, message: 'Tax rate not found.' });
    }
    await Product.updateMany(
      { tenantId: req.tenantId, taxRateId: taxRate._id },
      { $set: { taxRateId: null } }
    );
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
