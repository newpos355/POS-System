const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const SalesOrder = require('../models/SalesOrder');
const Shipment = require('../models/Shipment');
const SerialNumber = require('../models/SerialNumber');
const Batch = require('../models/Batch');
const { nextDocNumber } = require('../utils/docNumber');
const { allocateBackorders, recomputeFulfillmentStatus } = require('../services/salesToPurchase');
const { logActivity } = require('../utils/audit');

const isDbConnected = () => mongoose.connection.readyState === 1;

const getDefaultBranch = async (tenantId) => {
  return await Branch.findOne({ tenantId, isDefault: true })
    || await Branch.findOne({ tenantId });
};

// ─── GET ALL PURCHASE ORDERS ───────────────────────────────────────────────────
exports.getPurchaseOrders = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const query = { tenantId: req.tenantId };
    if (req.query.status) query.status = req.query.status;

    const [total, pos] = await Promise.all([
      PurchaseOrder.countDocuments(query),
      PurchaseOrder.find(query)
        .populate('vendorId', 'name company')
        .populate('branchId', 'name')
        .populate('sourceSalesOrderIds', 'orderNumber')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
    ]);

    const data = pos.map(p => ({
      _id: p._id,
      poNumber: p.poNumber,
      vendor: { name: p.vendorId?.name || p.vendorId?.company || 'Unknown Vendor' },
      branch: { name: p.branchId?.name || 'Main Branch' },
      itemsCount: p.items?.length || 0,
      items: p.items || [],
      receivedItems: p.receivedItems || [],
      grandTotal: p.grandTotal || 0,
      total: p.grandTotal || 0,
      status: p.status,
      sourceType: p.sourceType || 'manual',
      sourceOrders: (p.sourceSalesOrderIds || [])
        .filter(so => so && so.orderNumber)
        .map(so => ({ _id: so._id, orderNumber: so.orderNumber })),
      expectedDate: p.expectedDate,
      createdAt: p.createdAt,
    }));

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('Get POs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET SINGLE PO ─────────────────────────────────────────────────────────────
exports.getPurchaseOrder = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const po = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('vendorId', 'name company email phone')
      .populate('branchId', 'name address')
      .populate('items.productId', 'name sku trackingType');

    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    }

    res.json({ success: true, data: po });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE PO ─────────────────────────────────────────────────────────────────
exports.createPurchaseOrder = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const vendorId = req.body.vendorId || req.body.vendor;
    const { items, expectedDate, notes, status } = req.body;
    let { branchId } = req.body;

    if (!branchId) {
      const branch = await getDefaultBranch(req.tenantId);
      branchId = branch?._id;
    }

    if (!vendorId) {
      return res.status(400).json({ success: false, message: 'Vendor is required.' });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item is required.' });
    }

    // Generate unique PO number — check globally to avoid E11000 collisions
    const totalPOs = await PurchaseOrder.countDocuments({});
    const lastPO   = await PurchaseOrder.findOne({}).sort('-createdAt').select('poNumber');

    let nextNum = totalPOs + 1;
    if (lastPO?.poNumber) {
      const parts = lastPO.poNumber.split('-');
      const last  = parseInt(parts[parts.length - 1] || '0', 10);
      if (!isNaN(last) && last >= nextNum) nextNum = last + 1;
    }

    let poNumber = `PO-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
    let poExists = await PurchaseOrder.exists({ poNumber });
    while (poExists) {
      nextNum += 1;
      poNumber = `PO-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
      poExists = await PurchaseOrder.exists({ poNumber });
    }

    const grandTotal = items.reduce((sum, item) =>
      sum + (Number(item.quantity) * Number(item.unitCost)), 0);

    const po = await PurchaseOrder.create({
      tenantId: req.tenantId,
      poNumber,
      vendorId,
      branchId,
      items: items.map(item => ({
        productId: item.product || item.productId,
        name: item.name,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        total: Number(item.quantity) * Number(item.unitCost),
      })),
      grandTotal,
      expectedDate: expectedDate ? new Date(expectedDate) : undefined,
      notes,
      status: status || 'draft',
    });

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'po_created', entity: 'PurchaseOrder', entityId: po._id,
      description: `PO ${poNumber} \u2014 ${(grandTotal || 0).toLocaleString()}`,
    });

    // Automation: workflow rules & webhooks subscribed to new POs.
    require('../services/automationEngine').emitEvent(req.tenantId, 'purchase.created', { purchase: po });

    res.status(201).json({ success: true, data: po });
  } catch (error) {
    console.error('Create PO error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'PO number conflict, please retry.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE PO ─────────────────────────────────────────────────────────────────
exports.updatePurchaseOrder = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const po = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    if (po.status === 'received') {
      return res.status(400).json({ success: false, message: 'Cannot edit a received purchase order.' });
    }

    // See customerController.updateCustomer for why tenantId/_id are stripped.
    const { tenantId, _id, ...safeBody } = req.body;
    const updated = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { ...safeBody, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── RECEIVE ITEMS (partial or full) ──────────────────────────────────────────
// Accepts per-line received quantities: body.receivedItems =
// [{productId, receivedQty}]. An empty body receives everything still
// outstanding (which is exactly what the old all-or-nothing implementation
// did, so existing callers keep working). Receipts accumulate into
// po.receivedItems, and status only flips to 'received' once every line is
// fully in — otherwise it's 'partial'.
//
// Two special PO provenances (see PurchaseOrder.sourceType):
// - 'dropship': the goods went straight from the vendor to the customer, so
//   NOTHING is added to local stock — instead the linked sales-order lines
//   are marked shipped and a vendor-origin Shipment is auto-created.
// - 'backorder' / 'sales_order': after stock is added, the newly-arrived
//   units are atomically re-reserved against the waiting backordered order
//   lines (allocateBackorders), racing fairly with concurrent walk-in sales.
exports.receiveItems = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const po = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    }
    if (po.status === 'received') {
      return res.status(400).json({ success: false, message: 'This purchase order is already received.' });
    }
    if (po.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This purchase order is cancelled.' });
    }

    let branchId = po.branchId;
    if (!branchId) {
      const branch = await getDefaultBranch(req.tenantId);
      branchId = branch?._id;
      po.branchId = branchId;
    }

    // How much of each line has already been received in earlier receipts.
    const alreadyReceived = new Map();
    for (const r of po.receivedItems || []) {
      const key = String(r.productId);
      alreadyReceived.set(key, (alreadyReceived.get(key) || 0) + Number(r.quantity || 0));
    }
    const remainingFor = (item) => {
      const ordered = Number(item.quantity) || 0;
      return Math.max(0, ordered - (alreadyReceived.get(String(item.productId)) || 0));
    };

    // Resolve what this request actually receives, clamped per line to what's
    // still outstanding so a double-submit can never over-receive.
    const requested = Array.isArray(req.body.receivedItems) && req.body.receivedItems.length > 0
      ? req.body.receivedItems
      : null;
    const receivedLines = []; // {productId, quantity}
    for (const item of po.items) {
      if (!item.productId) continue;
      const remaining = remainingFor(item);
      if (remaining <= 0) continue;

      let qty = remaining;
      if (requested) {
        const match = requested.find((r) =>
          String(r.productId || r.product) === String(item.productId));
        qty = Math.min(remaining, Math.max(0, Number(match?.receivedQty ?? match?.quantity) || 0));
      }
      if (qty > 0) receivedLines.push({ productId: item.productId, quantity: qty });
    }

    if (receivedLines.length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to receive — all lines are already fully received or no quantities were given.' });
    }

    const isDropship = po.sourceType === 'dropship';

    // ── Tracking intake validation (serial / batch) ──────────────────────
    // Serial-tracked products must arrive with exactly one unique serial per
    // unit; batch-tracked products need a batch number. Every line is
    // validated BEFORE anything mutates, so a bad line aborts the whole
    // receive cleanly. Dropship POs skip intake entirely — the goods go
    // straight to the customer and never enter this stock.
    if (!isDropship) {
      const trackDocs = await Product.find({
        _id: { $in: receivedLines.map((l) => l.productId) },
        tenantId: req.tenantId,
      }).select('name trackingType');
      const trackMap = new Map(trackDocs.map((p) => [String(p._id), p]));

      for (const line of receivedLines) {
        const prod = trackMap.get(String(line.productId));
        const reqLine = requested?.find((r) =>
          String(r.productId || r.product) === String(line.productId));
        if (prod?.trackingType === 'serial') {
          const serials = [...new Set((reqLine?.serials || [])
            .map((s) => String(s).trim()).filter(Boolean))];
          if (serials.length !== line.quantity) {
            return res.status(400).json({
              success: false,
              message: `"${prod.name}" is serial-tracked — provide exactly ${line.quantity} unique serial number(s) with this receipt (got ${serials.length}).`,
            });
          }
          const dup = await SerialNumber.findOne({
            tenantId: req.tenantId, productId: line.productId, serial: { $in: serials },
          });
          if (dup) {
            return res.status(400).json({
              success: false,
              message: `Serial "${dup.serial}" already exists for "${prod.name}".`,
            });
          }
          line.serials = serials;
        } else if (prod?.trackingType === 'batch') {
          const batchNumber = String(reqLine?.batchNumber || '').trim();
          if (!batchNumber) {
            return res.status(400).json({
              success: false,
              message: `"${prod.name}" is batch-tracked — provide a batch number with this receipt.`,
            });
          }
          line.batchNumber = batchNumber;
          line.batchExpiry = reqLine?.batchExpiryDate ? new Date(reqLine.batchExpiryDate) : undefined;
        }
      }
    }

    if (!isDropship) {
      // Ordinary receipt: goods enter local stock, and tracked products get
      // their ledger entries (serial docs / batch lots) alongside the count.
      for (const line of receivedLines) {
        if (line.serials) {
          await SerialNumber.insertMany(line.serials.map((serial) => ({
            tenantId: req.tenantId,
            productId: line.productId,
            serial,
            branchId,
            purchaseOrderId: po._id,
          })));
        }
        if (line.batchNumber) {
          await Batch.findOneAndUpdate(
            { tenantId: req.tenantId, productId: line.productId, batchNumber: line.batchNumber },
            {
              $inc: { quantity: line.quantity, initialQuantity: line.quantity },
              $setOnInsert: { branchId, purchaseOrderId: po._id },
              ...(line.batchExpiry ? { $set: { expiryDate: line.batchExpiry } } : {}),
            },
            { upsert: true }
          );
        }
        if (branchId) {
          await Inventory.findOneAndUpdate(
            { productId: line.productId, branchId, tenantId: req.tenantId },
            { $inc: { quantity: line.quantity }, $set: { lastUpdated: new Date() } },
            { upsert: true, new: true }
          );
        }
        await Product.findOneAndUpdate(
          { _id: line.productId, tenantId: req.tenantId },
          { $inc: { stock: line.quantity } }
        );
      }
    }

    // Record this receipt and derive the new status.
    const now = new Date();
    for (const line of receivedLines) {
      po.receivedItems.push({ productId: line.productId, quantity: line.quantity, receivedAt: now });
      const key = String(line.productId);
      alreadyReceived.set(key, (alreadyReceived.get(key) || 0) + line.quantity);
    }
    const fullyReceived = po.items.every((item) => !item.productId || remainingFor(item) <= 0);
    po.status = fullyReceived ? 'received' : 'partial';
    if (fullyReceived) po.receivedAt = now;

    let allocated = [];
    let dropshipShipments = [];
    if (isDropship) {
      dropshipShipments = await markDropshipShipped({ tenantId: req.tenantId, po, receivedLines, userId: req.user?._id });
    } else if (po.sourceSalesOrderIds?.length) {
      allocated = await allocateBackorders({ tenantId: req.tenantId, po, receivedLines });
    }

    await po.save();

    const { createNotification } = require('./notificationController');
    createNotification({
      tenantId: req.tenantId,
      type: 'new_purchase',
      priority: 'medium',
      title: isDropship ? '🚚 Dropship PO Fulfilled' : (fullyReceived ? '📦 PO Received & Stock Added' : '📦 PO Partially Received'),
      message: isDropship
        ? `Dropship PO ${po.poNumber} fulfilled by vendor — customer shipment(s) created.`
        : `Purchase Order ${po.poNumber} ${fullyReceived ? 'fully received' : 'partially received'}. Inventory updated.${allocated.length ? ` ${allocated.length} backordered line(s) allocated.` : ''}`,
      actionUrl: isDropship ? '/shipments' : '/inventory',
      refId: po._id,
      refModel: 'PurchaseOrder',
    });

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'po_received', entity: 'PurchaseOrder', entityId: po._id,
      description: `Received ${po.poNumber} (${fullyReceived ? 'full' : 'partial'})`,
    });

    res.json({
      success: true,
      message: isDropship
        ? 'Dropship fulfillment recorded — sales order lines marked shipped.'
        : `Items received${fullyReceived ? '' : ' (partial)'} and stock updated.`,
      data: po,
      allocated,
      shipments: dropshipShipments,
    });
  } catch (error) {
    console.error('Receive items error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Marks the sales-order lines behind a dropship PO as shipped and creates one
// vendor-origin Shipment per source sales order. Never touches stock — the
// retailer never held these goods.
async function markDropshipShipped({ tenantId, po, receivedLines, userId }) {
  const shipments = [];
  const bySale = new Map(); // saleId -> [{item, qty}]

  for (const recv of receivedLines) {
    let remaining = recv.quantity;
    for (const poItem of po.items) {
      if (remaining <= 0) break;
      if (String(poItem.productId) !== String(recv.productId)) continue;
      if (!poItem.sourceSalesOrderId || !poItem.sourceOrderItemId) continue;
      const key = String(poItem.sourceSalesOrderId);
      if (!bySale.has(key)) bySale.set(key, []);
      bySale.get(key).push({ orderItemId: poItem.sourceOrderItemId, qty: Math.min(remaining, Number(poItem.quantity)) });
      remaining -= Math.min(remaining, Number(poItem.quantity));
    }
  }

  for (const [saleId, lines] of bySale.entries()) {
    const sale = await SalesOrder.findOne({ _id: saleId, tenantId });
    if (!sale) continue;

    const packageItems = [];
    for (const { orderItemId, qty } of lines) {
      const line = sale.items.id(orderItemId);
      if (!line) continue;
      const maxShippable = Math.max(0,
        Number(line.quantity) - Number(line.cancelledQty || 0) - Number(line.shippedQty || 0));
      const shipQty = Math.min(qty, maxShippable);
      if (shipQty <= 0) continue;
      line.shippedQty = Number(line.shippedQty || 0) + shipQty;
      if (line.shippedQty >= Number(line.quantity) - Number(line.cancelledQty || 0)) {
        line.lineStatus = 'shipped';
      }
      packageItems.push({
        productId: line.productId, name: line.name, sku: line.sku,
        quantity: shipQty, orderItemId: line._id,
      });
    }
    if (packageItems.length === 0) continue;

    recomputeFulfillmentStatus(sale);
    await sale.save();

    const shipmentNumber = await nextDocNumber(Shipment, tenantId, 'SH', 'shipmentNumber');
    const shipment = await Shipment.create({
      tenantId,
      shipmentNumber,
      salesOrderId: sale._id,
      orderNumber: sale.orderNumber,
      branchId: po.branchId,
      customerId: po.dropshipCustomerId || sale.customerId || undefined,
      shipToAddress: po.shipToAddress,
      status: 'dispatched',
      origin: 'vendor',
      vendorId: po.vendorId,
      purchaseOrderId: po._id,
      createdBy: userId,
      shippedAt: new Date(),
      packages: [{ packageNumber: 1, items: packageItems }],
      notes: `Auto-created from dropship PO ${po.poNumber}`,
    });
    shipments.push(shipment);
  }

  return shipments;
}

// ─── RECORD VENDOR PAYMENT ────────────────────────────────────────────────────
// Pays down what the business owes the vendor on this PO. Guarded by $expr so
// paidAmount can never exceed grandTotal even under concurrent submissions.
exports.recordPOPayment = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be a positive number.' });
    }
    const allowed = ['Cash', 'Card', 'Airtel Money', 'MTN MoMo', 'Bank Transfer', 'Other'];
    const method = allowed.includes(req.body.method) ? req.body.method : 'Bank Transfer';

    const po = await PurchaseOrder.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.tenantId,
        status: { $ne: 'cancelled' },
        $expr: {
          $lte: [{ $add: [{ $ifNull: ['$paidAmount', 0] }, amount] }, { $ifNull: ['$grandTotal', 0] }],
        },
      },
      {
        $inc: { paidAmount: amount },
        $push: {
          payments: {
            method,
            amount,
            reference: req.body.reference ? String(req.body.reference).slice(0, 100) : undefined,
            paidBy: req.user._id,
          },
        },
      },
      { new: true }
    );
    if (!po) {
      return res.status(400).json({
        success: false,
        message: 'Purchase order not found, or the payment exceeds what is still owed on it.',
      });
    }

    po.paymentStatus = po.paidAmount >= (po.grandTotal || 0) - 0.009 ? 'paid' : 'partial';
    await po.save();

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'po_payment', entity: 'PurchaseOrder', entityId: po._id,
      description: `Paid vendor ${amount.toLocaleString()} (${method}) on ${po.poNumber}`,
    });

    res.json({
      success: true,
      message: po.paymentStatus === 'paid'
        ? `${po.poNumber} fully paid.`
        : `Payment recorded — ${((po.grandTotal || 0) - po.paidAmount).toLocaleString()} still owed on ${po.poNumber}.`,
      data: po,
    });
  } catch (error) {
    console.error('Record PO payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE PO ─────────────────────────────────────────────────────────────────
exports.deletePurchaseOrder = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const po = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    }
    if (po.status === 'received') {
      return res.status(400).json({ success: false, message: 'Cannot delete a received purchase order.' });
    }

    await po.deleteOne();
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
