const mongoose = require('mongoose');
const SerialNumber = require('../models/SerialNumber');
const Batch = require('../models/Batch');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Branch = require('../models/Branch');

const isDbConnected = () => mongoose.connection.readyState === 1;

const getDefaultBranch = async (tenantId) => {
  return await Branch.findOne({ tenantId, isDefault: true })
    || await Branch.findOne({ tenantId });
};

// Registering serials/batches for stock that ALREADY exists (opening stock,
// pre-tracking inventory) should not change the count — but adding brand-new
// stock through this page should. The caller decides via `addStock`.
const addStockCount = async (tenantId, productId, branchId, qty) => {
  if (qty <= 0) return;
  if (branchId) {
    await Inventory.findOneAndUpdate(
      { productId, branchId, tenantId },
      { $inc: { quantity: qty }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
  }
  await Product.findOneAndUpdate({ _id: productId, tenantId }, { $inc: { stock: qty } });
};

// ─── SERIALS ─────────────────────────────────────────────────────────────────

exports.getSerials = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const query = { tenantId: req.tenantId };
    if (req.query.productId && mongoose.Types.ObjectId.isValid(req.query.productId)) {
      query.productId = req.query.productId;
    }
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) query.serial = { $regex: req.query.search, $options: 'i' };

    const serials = await SerialNumber.find(query)
      .populate('productId', 'name sku')
      .populate('salesOrderId', 'orderNumber')
      .sort('-createdAt')
      .limit(parseInt(req.query.limit) || 500);

    res.json({ success: true, data: serials });
  } catch (error) {
    console.error('Get serials error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/tracking/serials — register serials for a serial-tracked product.
// body: { productId, serials: ['SN1', 'SN2', ...], addStock: bool }
exports.addSerials = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { productId, addStock } = req.body;
    const serials = [...new Set((req.body.serials || [])
      .map((s) => String(s).trim()).filter(Boolean))];

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'A product is required.' });
    }
    if (serials.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one serial number is required.' });
    }
    const product = await Product.findOne({ _id: productId, tenantId: req.tenantId })
      .select('name trackingType');
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    if (product.trackingType !== 'serial') {
      return res.status(400).json({ success: false, message: `"${product.name}" is not serial-tracked — set its tracking type to Serial on the product form first.` });
    }
    const dup = await SerialNumber.findOne({
      tenantId: req.tenantId, productId, serial: { $in: serials },
    });
    if (dup) {
      return res.status(409).json({ success: false, message: `Serial "${dup.serial}" already exists for this product.` });
    }

    const branch = await getDefaultBranch(req.tenantId);
    const created = await SerialNumber.insertMany(serials.map((serial) => ({
      tenantId: req.tenantId,
      productId,
      serial,
      branchId: branch?._id,
      notes: 'Added manually',
    })));

    if (addStock) {
      await addStockCount(req.tenantId, productId, branch?._id, created.length);
    }

    res.status(201).json({ success: true, data: created, stockAdded: Boolean(addStock) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'One of those serials already exists for this product.' });
    }
    console.error('Add serials error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/tracking/serials/:id/status — manual status flips (in_stock ↔
// returned/defective). 'sold' is reserved for actual checkouts and can't be
// set by hand; a sold unit likewise can't be flipped here (void the sale, or
// process a return, first). Pure ledger flag — never changes stock counts.
exports.updateSerialStatus = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { status } = req.body;
    const allowed = ['in_stock', 'returned', 'defective'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}.` });
    }

    const serial = await SerialNumber.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $ne: 'sold' } },
      { $set: { status } },
      { new: true }
    );
    if (!serial) {
      return res.status(404).json({ success: false, message: 'Serial not found, or it is sold (void the sale or process a return first).' });
    }
    res.json({ success: true, data: serial });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/tracking/serials/:id — cleanup of an unsold serial (typo etc.).
exports.deleteSerial = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const serial = await SerialNumber.findOneAndDelete({
      _id: req.params.id, tenantId: req.tenantId, status: { $ne: 'sold' },
    });
    if (!serial) {
      return res.status(404).json({ success: false, message: 'Serial not found, or it is sold and cannot be deleted.' });
    }
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── BATCHES ─────────────────────────────────────────────────────────────────

exports.getBatches = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const query = { tenantId: req.tenantId };
    if (req.query.productId && mongoose.Types.ObjectId.isValid(req.query.productId)) {
      query.productId = req.query.productId;
    }
    if (req.query.search) query.batchNumber = { $regex: req.query.search, $options: 'i' };

    const batches = await Batch.find(query)
      .populate('productId', 'name sku')
      .sort('expiryDate')
      .limit(parseInt(req.query.limit) || 500);

    res.json({ success: true, data: batches });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/tracking/batches — register a lot for a batch-tracked product.
// Same batch number accumulates. body: { productId, batchNumber, quantity,
// expiryDate?, addStock }
exports.addBatch = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { productId, addStock, expiryDate } = req.body;
    const batchNumber = String(req.body.batchNumber || '').trim();
    const quantity = Number(req.body.quantity);

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'A product is required.' });
    }
    if (!batchNumber) {
      return res.status(400).json({ success: false, message: 'A batch number is required.' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number.' });
    }
    const product = await Product.findOne({ _id: productId, tenantId: req.tenantId })
      .select('name trackingType');
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    if (product.trackingType !== 'batch') {
      return res.status(400).json({ success: false, message: `"${product.name}" is not batch-tracked — set its tracking type to Batch on the product form first.` });
    }

    const branch = await getDefaultBranch(req.tenantId);
    const batch = await Batch.findOneAndUpdate(
      { tenantId: req.tenantId, productId, batchNumber },
      {
        $inc: { quantity, initialQuantity: quantity },
        $setOnInsert: { branchId: branch?._id },
        ...(expiryDate ? { $set: { expiryDate: new Date(expiryDate) } } : {}),
      },
      { upsert: true, new: true }
    );

    if (addStock) {
      await addStockCount(req.tenantId, productId, branch?._id, quantity);
    }

    res.status(201).json({ success: true, data: batch, stockAdded: Boolean(addStock) });
  } catch (error) {
    console.error('Add batch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/tracking/batches/:id — expiry/notes only. Quantities move through
// receipts, sales, and their reversals — never edited directly, so the lot
// ledger can't be silently rewritten.
exports.updateBatch = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const update = {};
    if (req.body.expiryDate !== undefined) {
      update.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
    }
    if (req.body.notes !== undefined) update.notes = req.body.notes;

    const batch = await Batch.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true }
    );
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }
    res.json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
