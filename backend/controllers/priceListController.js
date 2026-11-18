const mongoose = require('mongoose');
const PriceList = require('../models/PriceList');
const Customer = require('../models/Customer');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── LIST PRICE LISTS ─────────────────────────────────────────────────────────
exports.getPriceLists = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const priceLists = await PriceList.find({ tenantId: req.tenantId }).sort('name');
    // How many customers each list is assigned to, for the list page.
    const counts = await Customer.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(String(req.tenantId)), priceListId: { $ne: null } } },
      { $group: { _id: '$priceListId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json({
      success: true,
      data: priceLists.map((pl) => ({
        ...pl.toObject(),
        customerCount: countMap.get(String(pl._id)) || 0,
      })),
    });
  } catch (error) {
    console.error('Get price lists error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET SINGLE PRICE LIST ────────────────────────────────────────────────────
exports.getPriceList = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const priceList = await PriceList.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('items.productId', 'name sku price');
    if (!priceList) {
      return res.status(404).json({ success: false, message: 'Price list not found.' });
    }
    res.json({ success: true, data: priceList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE PRICE LIST ────────────────────────────────────────────────────────
exports.createPriceList = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { name, description, type, percentage, items } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'A name is required.' });
    }

    const priceList = await PriceList.create({
      tenantId: req.tenantId,
      name: String(name).trim(),
      description,
      type: type === 'percent' ? 'percent' : 'per_item',
      percentage: Math.max(-100, Number(percentage) || 0),
      items: normalizeItems(items),
    });

    res.status(201).json({ success: true, data: priceList });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A price list with that name already exists.' });
    }
    console.error('Create price list error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE PRICE LIST ────────────────────────────────────────────────────────
exports.updatePriceList = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { name, description, type, percentage, items, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = description;
    if (type !== undefined) update.type = type === 'percent' ? 'percent' : 'per_item';
    if (percentage !== undefined) update.percentage = Math.max(-100, Number(percentage) || 0);
    if (items !== undefined) update.items = normalizeItems(items);
    if (isActive !== undefined) update.isActive = Boolean(isActive);

    const priceList = await PriceList.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!priceList) {
      return res.status(404).json({ success: false, message: 'Price list not found.' });
    }
    res.json({ success: true, data: priceList });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A price list with that name already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE PRICE LIST ────────────────────────────────────────────────────────
// Customers assigned to it fall back to standard prices.
exports.deletePriceList = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const priceList = await PriceList.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!priceList) {
      return res.status(404).json({ success: false, message: 'Price list not found.' });
    }
    await Customer.updateMany(
      { tenantId: req.tenantId, priceListId: priceList._id },
      { $set: { priceListId: null } }
    );
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i && i.productId && mongoose.Types.ObjectId.isValid(i.productId)
      && Number.isFinite(Number(i.customPrice)) && Number(i.customPrice) >= 0)
    .map((i) => ({ productId: i.productId, customPrice: Number(i.customPrice) }));
}
