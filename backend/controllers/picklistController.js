const mongoose = require('mongoose');
const Picklist = require('../models/Picklist');
const SalesOrder = require('../models/SalesOrder');
const Product = require('../models/Product');
const { nextDocNumber } = require('../utils/docNumber');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── LIST PICKLISTS ───────────────────────────────────────────────────────────
exports.getPicklists = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const query = { tenantId: req.tenantId };
    if (req.query.status) query.status = req.query.status;

    const picklists = await Picklist.find(query)
      .populate('assignedTo', 'name')
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .limit(parseInt(req.query.limit) || 200);

    res.json({ success: true, data: picklists });
  } catch (error) {
    console.error('Get picklists error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET SINGLE PICKLIST ──────────────────────────────────────────────────────
exports.getPicklist = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const picklist = await Picklist.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('assignedTo', 'name')
      .populate('createdBy', 'name')
      .populate('branchId', 'name');

    if (!picklist) {
      return res.status(404).json({ success: false, message: 'Picklist not found.' });
    }
    res.json({ success: true, data: picklist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE PICKLIST (from one sales order) ───────────────────────────────────
// Includes only lines with physically-reserved units still waiting to be
// picked: dropship lines never held local stock, and a backordered line's
// un-arrived shortfall can't be picked either — only its reserved portion.
// No stock mutation happens here or at completion: stock left the ledger at
// sale time, picking is purely a physical-progress marker.
exports.createPicklist = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { salesOrderId, assignedTo, notes } = req.body;
    if (!salesOrderId || !mongoose.Types.ObjectId.isValid(salesOrderId)) {
      return res.status(400).json({ success: false, message: 'A sales order is required.' });
    }

    const sale = await SalesOrder.findOne({ _id: salesOrderId, tenantId: req.tenantId });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sales order not found.' });
    }
    if (sale.status === 'voided') {
      return res.status(400).json({ success: false, message: 'Cannot pick a voided sale.' });
    }

    const items = [];
    for (const line of sale.items) {
      if (line.fulfillmentMode === 'dropship') continue;
      const reserved = line.reservedQty === null || line.reservedQty === undefined
        ? Number(line.quantity)
        : Number(line.reservedQty);
      const pickable = Math.min(
        reserved,
        Number(line.quantity) - Number(line.cancelledQty || 0)
      ) - Number(line.pickedQty || 0);
      if (pickable <= 0) continue;

      const product = line.productId
        ? await Product.findOne({ _id: line.productId, tenantId: req.tenantId }).select('barcode')
        : null;

      items.push({
        productId: line.productId,
        name: line.name,
        sku: line.sku,
        barcode: product?.barcode || '',
        salesOrderId: sale._id,
        orderItemId: line._id,
        requestedQty: pickable,
        pickedQty: 0,
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nothing to pick on this order — all in-stock lines are already picked (or the order is dropship/backorder only).',
      });
    }

    const picklistNumber = await nextDocNumber(Picklist, req.tenantId, 'PL', 'picklistNumber');
    const picklist = await Picklist.create({
      tenantId: req.tenantId,
      picklistNumber,
      branchId: sale.branchId,
      salesOrderIds: [sale._id],
      orderNumbers: [sale.orderNumber],
      items,
      assignedTo: assignedTo && mongoose.Types.ObjectId.isValid(assignedTo) ? assignedTo : undefined,
      createdBy: req.user._id,
      notes,
    });

    // Creating a picklist pulls the order into the fulfillment pipeline.
    if (sale.fulfillmentStatus === 'not_required') {
      sale.fulfillmentStatus = 'pending';
      await sale.save();
    }

    res.status(201).json({ success: true, data: picklist });
  } catch (error) {
    console.error('Create picklist error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE PICKED QUANTITIES ─────────────────────────────────────────────────
// body: { items: [{ itemId, pickedQty }] } — clamped to [0, requestedQty].
exports.updatePickedQty = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const picklist = await Picklist.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!picklist) {
      return res.status(404).json({ success: false, message: 'Picklist not found.' });
    }
    if (!['open', 'in_progress'].includes(picklist.status)) {
      return res.status(400).json({ success: false, message: `Cannot update a ${picklist.status} picklist.` });
    }

    for (const upd of req.body.items || []) {
      const item = picklist.items.id(upd.itemId);
      if (!item) continue;
      const qty = Number(upd.pickedQty);
      if (!Number.isFinite(qty)) continue;
      item.pickedQty = Math.min(Math.max(0, qty), Number(item.requestedQty));
    }

    if (picklist.status === 'open') {
      picklist.status = 'in_progress';
      picklist.startedAt = picklist.startedAt || new Date();
    }
    await picklist.save();

    res.json({ success: true, data: picklist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── COMPLETE PICKLIST ────────────────────────────────────────────────────────
// Writes pickedQty back onto the sales-order lines. Guarded by a conditional
// update on status so a double-click can't write the quantities back twice.
exports.completePicklist = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const picklist = await Picklist.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $in: ['open', 'in_progress'] } },
      { $set: { status: 'picked', completedAt: new Date() } },
      { new: true }
    );
    if (!picklist) {
      return res.status(404).json({ success: false, message: 'Picklist not found or already completed/cancelled.' });
    }

    // If the caller sent final quantities along with completion, apply them.
    if (Array.isArray(req.body.items)) {
      for (const upd of req.body.items) {
        const item = picklist.items.id(upd.itemId);
        if (!item) continue;
        const qty = Number(upd.pickedQty);
        if (!Number.isFinite(qty)) continue;
        item.pickedQty = Math.min(Math.max(0, qty), Number(item.requestedQty));
      }
      await picklist.save();
    }

    // Write progress back onto each sales-order line.
    const saleCache = new Map();
    for (const item of picklist.items) {
      if (Number(item.pickedQty || 0) <= 0) continue;
      const key = String(item.salesOrderId);
      if (!saleCache.has(key)) {
        saleCache.set(key, await SalesOrder.findOne({ _id: item.salesOrderId, tenantId: req.tenantId }));
      }
      const sale = saleCache.get(key);
      if (!sale) continue;
      const line = sale.items.id(item.orderItemId);
      if (!line) continue;
      const maxPickable = Number(line.quantity) - Number(line.cancelledQty || 0);
      line.pickedQty = Math.min(maxPickable, Number(line.pickedQty || 0) + Number(item.pickedQty));
      if (line.pickedQty >= maxPickable && ['open', 'allocated'].includes(line.lineStatus)) {
        line.lineStatus = 'picked';
      }
    }
    for (const sale of saleCache.values()) {
      if (sale) await sale.save();
    }

    res.json({ success: true, message: 'Picklist completed.', data: picklist });
  } catch (error) {
    console.error('Complete picklist error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CANCEL PICKLIST ──────────────────────────────────────────────────────────
exports.cancelPicklist = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const picklist = await Picklist.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $in: ['open', 'in_progress'] } },
      { $set: { status: 'cancelled' } },
      { new: true }
    );
    if (!picklist) {
      return res.status(404).json({ success: false, message: 'Picklist not found or already completed/cancelled.' });
    }
    res.json({ success: true, data: picklist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
