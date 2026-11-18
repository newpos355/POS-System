const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const StockAdjustment = require('../models/StockAdjustment');
const { logActivity } = require('../utils/audit');

const isDbConnected = () => mongoose.connection.readyState === 1;

const getDefaultBranch = async (tenantId) => {
  return await Branch.findOne({ tenantId, isDefault: true })
    || await Branch.findOne({ tenantId });
};

// ─── GET INVENTORY ─────────────────────────────────────────────────────────────
exports.getInventory = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    // 1. Fetch all products for this tenant
    const prodQuery = { tenantId: req.tenantId };
    if (req.query.search) {
      prodQuery.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { sku: { $regex: req.query.search, $options: 'i' } },
      ];
    }
    const products = await Product.find(prodQuery)
      .populate('categoryId', 'name')
      .sort('-createdAt');

    // 2. Fetch existing inventory records for this tenant
    const invQuery = { tenantId: req.tenantId };
    if (req.query.branchId && mongoose.Types.ObjectId.isValid(req.query.branchId)) {
      invQuery.branchId = req.query.branchId;
    }
    const invRecords = await Inventory.find(invQuery).populate('branchId', 'name');

    // Create a lookup map for existing inventory records by productId
    const invMap = {};
    invRecords.forEach(inv => {
      if (inv.productId) {
        invMap[inv.productId.toString()] = inv;
      }
    });

    // Get default branch if needed
    const defaultBranch = await getDefaultBranch(req.tenantId);

    // 3. Map over all products to ensure every product has an inventory entry
    const allItems = products.map(prod => {
      const pIdStr = prod._id.toString();
      const existingInv = invMap[pIdStr];

      let qty = prod.stock || 0;
      let branchName = defaultBranch?.name || 'Main Branch';
      let lastUpdated = prod.updatedAt || prod.createdAt;
      let invId = prod._id;

      if (existingInv) {
        invId = existingInv._id;
        branchName = existingInv.branchId?.name || branchName;
        lastUpdated = existingInv.lastUpdated || existingInv.updatedAt || lastUpdated;
        // Always trust the Inventory record — it is the source of truth after adjustments
        qty = existingInv.quantity;
      } else {
        // Auto-create Inventory record in DB for seamless future tracking
        if (defaultBranch) {
          Inventory.findOneAndUpdate(
            { productId: prod._id, branchId: defaultBranch._id, tenantId: req.tenantId },
            { $set: { quantity: prod.stock || 0, reorderLevel: prod.reorderLevel || 10, lastUpdated: new Date() } },
            { upsert: true }
          ).catch(() => {});
        }
      }

      const reorderLevel = prod.reorderLevel || 10;
      let status = 'In Stock';
      if (qty === 0) status = 'Out of Stock';
      else if (qty <= reorderLevel) status = 'Low Stock';

      // Apply status filter if provided
      if (req.query.status && status !== req.query.status) return null;

      return {
        _id: invId,
        product: {
          _id: prod._id,
          name: prod.name,
          sku: prod.sku,
          barcode: prod.barcode || '',
        },
        branch: { name: branchName },
        quantity: qty,
        stock: qty,
        reorderLevel,
        status,
        lastUpdated,
      };
    }).filter(Boolean);

    // Pagination
    const total = allItems.length;
    const paginatedData = allItems.slice(skip, skip + limit);

    res.json({
      success: true,
      data: paginatedData,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── ADJUST STOCK ─────────────────────────────────────────────────────────────
exports.adjustStock = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { productId, quantity, type, reason } = req.body;
    let { branchId } = req.body;

    if (!branchId) {
      const branch = await getDefaultBranch(req.tenantId);
      if (!branch) {
        return res.status(400).json({ success: false, message: 'No branch found for this tenant.' });
      }
      branchId = branch._id;
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity.' });
    }

    // Read here is only for the StockAdjustment log's "previousQuantity" and
    // the 'remove' error message — it is NOT what guards against going
    // negative. That guard is the atomic conditional update below: reading
    // prevQty first and checking it in JS would leave a race window where two
    // concurrent removals both read the same stale quantity and both pass.
    const existing = await Inventory.findOne({ productId, branchId, tenantId: req.tenantId });
    const prevQty = existing?.quantity || 0;

    let inventory;
    if (type === 'set') {
      inventory = await Inventory.findOneAndUpdate(
        { productId, branchId, tenantId: req.tenantId },
        { $set: { quantity: qty, lastUpdated: new Date() } },
        { new: true, upsert: true }
      );
    } else if (type === 'add') {
      inventory = await Inventory.findOneAndUpdate(
        { productId, branchId, tenantId: req.tenantId },
        { $inc: { quantity: qty }, $set: { lastUpdated: new Date() } },
        { new: true, upsert: true }
      );
    } else if (type === 'remove') {
      // Atomic and conditional: only decrements if enough stock exists at the
      // moment the update actually runs, so two concurrent removals can't
      // both pass a stale check and drive quantity negative.
      inventory = await Inventory.findOneAndUpdate(
        { productId, branchId, tenantId: req.tenantId, quantity: { $gte: qty } },
        { $inc: { quantity: -qty }, $set: { lastUpdated: new Date() } },
        { new: true }
      );
      if (!inventory) {
        const current = await Inventory.findOne({ productId, branchId, tenantId: req.tenantId });
        return res.status(400).json({
          success: false,
          message: `Cannot remove ${qty} units. Only ${current?.quantity || 0} in stock.`,
        });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid type. Use add, remove, or set.' });
    }

    await inventory.populate([{ path: 'productId', select: 'name sku' }, { path: 'branchId', select: 'name' }]);
    const newQty = inventory.quantity;

    // Sync Product.stock field so POS terminal also reflects correct stock
    await Product.findOneAndUpdate(
      { _id: productId, tenantId: req.tenantId },
      { $set: { stock: newQty } }
    );

    // Log stock adjustment
    StockAdjustment.create({
      tenantId: req.tenantId,
      productId,
      branchId,
      adjustedBy: req.user._id || req.user.id,
      adjustmentType: type === 'add' ? 'increase' : type === 'remove' ? 'decrease' : 'increase',
      quantity: qty,
      reason: 'other',
      previousQuantity: prevQty,
      newQuantity: newQty,
      notes: reason || 'Manual adjustment',
    }).catch(() => {});

    res.json({ success: true, message: 'Stock adjusted successfully.', data: inventory });
  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── TRANSFER STOCK ────────────────────────────────────────────────────────────
exports.transferStock = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { productId, fromBranchId, toBranchId, quantity } = req.body;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity.' });
    }

    // Atomic and conditional, same reasoning as adjustStock's 'remove' case:
    // the old code read source.quantity, checked it, then decremented in a
    // separate step — two concurrent transfers of the same "last units"
    // could both pass the check against stale data and both succeed.
    const source = await Inventory.findOneAndUpdate(
      { productId, branchId: fromBranchId, tenantId: req.tenantId, quantity: { $gte: qty } },
      { $inc: { quantity: -qty }, $set: { lastUpdated: new Date() } },
      { new: true }
    );
    if (!source) {
      const current = await Inventory.findOne({ productId, branchId: fromBranchId, tenantId: req.tenantId });
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${current?.quantity || 0}`,
      });
    }

    try {
      await Inventory.findOneAndUpdate(
        { productId, branchId: toBranchId, tenantId: req.tenantId },
        { $inc: { quantity: qty }, $set: { lastUpdated: new Date() } },
        { upsert: true, new: true }
      );
    } catch (transferErr) {
      // Destination write failed — return the reserved stock to the source
      // branch rather than letting it vanish.
      await Inventory.findOneAndUpdate(
        { productId, branchId: fromBranchId, tenantId: req.tenantId },
        { $inc: { quantity: qty } }
      );
      throw transferErr;
    }

    res.json({ success: true, message: `${qty} units transferred successfully.` });
  } catch (error) {
    console.error('Transfer stock error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── STOCK MOVEMENTS ───────────────────────────────────────────────────────────
exports.getStockMovements = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const movements = await StockAdjustment.find({
      productId: req.params.productId,
      tenantId: req.tenantId,
    })
      .populate('adjustedBy', 'name')
      .sort('-createdAt')
      .limit(50);

    res.json({ success: true, data: movements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET ALL ADJUSTMENTS (for Store Management tab) ────────────────────────────
exports.getAdjustments = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const limit = parseInt(req.query.limit) || 100;
    const adjustments = await StockAdjustment.find({ tenantId: req.tenantId })
      .populate('productId', 'name sku')
      .populate('branchId', 'name')
      .populate('adjustedBy', 'name')
      .sort('-createdAt')
      .limit(limit);

    res.json({ success: true, data: adjustments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── REPACK STOCK ──────────────────────────────────────────────────────────────
// Converts stock of one product into another (e.g. one 25kg sack into
// 25 × 1kg packs): atomically reserves the source quantity (same conditional
// pattern as a sale, so it can't drive stock negative), adds the target
// quantity, and writes a RepackOrder audit document. Batch-tracked sources
// consume their lots FEFO; a batch-tracked target requires a batch number
// for the newly created packs. Serial-tracked and composite products can't
// be repacked — serials name physical units that don't survive conversion,
// and composites hold no stock of their own.
exports.repackStock = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  const RepackOrder = require('../models/RepackOrder');
  const Batch = require('../models/Batch');
  const { reserveAtomic, releaseAtomic, allocateBatchesFEFO } = require('../utils/stockOps');
  const { nextDocNumber } = require('../utils/docNumber');

  try {
    const { fromProductId, toProductId, notes } = req.body;
    const fromQty = Number(req.body.fromQty);
    const toQty = Number(req.body.toQty);

    if (!fromProductId || !toProductId
      || !require('mongoose').Types.ObjectId.isValid(fromProductId)
      || !require('mongoose').Types.ObjectId.isValid(toProductId)) {
      return res.status(400).json({ success: false, message: 'Both a source and a target product are required.' });
    }
    if (String(fromProductId) === String(toProductId)) {
      return res.status(400).json({ success: false, message: 'Source and target must be different products.' });
    }
    if (!Number.isInteger(fromQty) || fromQty < 1 || !Number.isInteger(toQty) || toQty < 1) {
      return res.status(400).json({ success: false, message: 'Quantities must be whole numbers of at least 1.' });
    }

    const [fromProduct, toProduct] = await Promise.all([
      Product.findOne({ _id: fromProductId, tenantId: req.tenantId }).select('name stock trackingType isComposite'),
      Product.findOne({ _id: toProductId, tenantId: req.tenantId }).select('name trackingType isComposite'),
    ]);
    if (!fromProduct || !toProduct) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    for (const p of [fromProduct, toProduct]) {
      if (p.trackingType === 'serial') {
        return res.status(400).json({ success: false, message: `"${p.name}" is serial-tracked and cannot be repacked.` });
      }
      if (p.isComposite) {
        return res.status(400).json({ success: false, message: `"${p.name}" is a bundle and holds no stock of its own to repack.` });
      }
    }

    const toBatchNumber = String(req.body.toBatchNumber || '').trim();
    if (toProduct.trackingType === 'batch' && !toBatchNumber) {
      return res.status(400).json({ success: false, message: `"${toProduct.name}" is batch-tracked — give the new packs a batch number.` });
    }

    let branchId = req.body.branchId;
    if (!branchId) {
      const branch = await getDefaultBranch(req.tenantId);
      branchId = branch?._id;
    }

    // Deduct the source atomically — fails cleanly if stock is short.
    const resv = await reserveAtomic({ tenantId: req.tenantId, productId: fromProductId, branchId, qty: fromQty });
    if (!resv.ok) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock of "${fromProduct.name}" — ${fromQty} needed, ${fromProduct.stock || 0} available.`,
      });
    }
    if (fromProduct.trackingType === 'batch') {
      await allocateBatchesFEFO(req.tenantId, fromProductId, fromQty, null);
    }

    // Add the target.
    await releaseAtomic({ tenantId: req.tenantId, productId: toProductId, branchId, qty: toQty });
    if (toProduct.trackingType === 'batch') {
      await Batch.findOneAndUpdate(
        { tenantId: req.tenantId, productId: toProductId, batchNumber: toBatchNumber },
        {
          $inc: { quantity: toQty, initialQuantity: toQty },
          $setOnInsert: { branchId },
          ...(req.body.toBatchExpiryDate ? { $set: { expiryDate: new Date(req.body.toBatchExpiryDate) } } : {}),
        },
        { upsert: true }
      );
    }

    const repackNumber = await nextDocNumber(RepackOrder, req.tenantId, 'RPK', 'repackNumber');
    const repack = await RepackOrder.create({
      tenantId: req.tenantId,
      repackNumber,
      branchId,
      fromProductId,
      fromName: fromProduct.name,
      fromQty,
      toProductId,
      toName: toProduct.name,
      toQty,
      notes,
      performedBy: req.user._id,
    });

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'stock_repacked', entity: 'RepackOrder', entityId: repack._id,
      description: `${repackNumber}: ${fromQty} x ${fromProduct.name} -> ${toQty} x ${toProduct.name}`,
    });

    res.status(201).json({ success: true, data: repack });
  } catch (error) {
    console.error('Repack error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── REPACK HISTORY ────────────────────────────────────────────────────────────
exports.getRepacks = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  const RepackOrder = require('../models/RepackOrder');
  try {
    const repacks = await RepackOrder.find({ tenantId: req.tenantId })
      .populate('performedBy', 'name')
      .sort('-createdAt')
      .limit(parseInt(req.query.limit) || 100);
    res.json({ success: true, data: repacks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
