const mongoose = require('mongoose');
const Shipment = require('../models/Shipment');
const SalesOrder = require('../models/SalesOrder');
const { nextDocNumber } = require('../utils/docNumber');
const { recomputeFulfillmentStatus } = require('../services/salesToPurchase');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── LIST SHIPMENTS ───────────────────────────────────────────────────────────
exports.getShipments = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const query = { tenantId: req.tenantId };
    if (req.query.status) query.status = req.query.status;
    if (req.query.salesOrderId && mongoose.Types.ObjectId.isValid(req.query.salesOrderId)) {
      query.salesOrderId = req.query.salesOrderId;
    }

    const shipments = await Shipment.find(query)
      .populate('customerId', 'name phone')
      .populate('vendorId', 'name')
      .sort('-createdAt')
      .limit(parseInt(req.query.limit) || 200);

    res.json({ success: true, data: shipments });
  } catch (error) {
    console.error('Get shipments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET SINGLE SHIPMENT ──────────────────────────────────────────────────────
exports.getShipment = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const shipment = await Shipment.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('customerId', 'name phone address')
      .populate('vendorId', 'name phone')
      .populate('branchId', 'name address city phone')
      .populate('picklistId', 'picklistNumber status');

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found.' });
    }
    res.json({ success: true, data: shipment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE SHIPMENT ──────────────────────────────────────────────────────────
// body: { salesOrderId, picklistId?, shipToAddress?, carrier?, notes?,
//         packages: [{ weightKg?, dimensions?, items: [{orderItemId, quantity}] }] }
// Package quantities are validated against what each line still has left to
// ship (quantity - cancelled - already shipped). Like picking, this never
// mutates stock — it only tracks the physical journey.
exports.createShipment = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { salesOrderId, picklistId, shipToAddress, carrier, notes, packages } = req.body;
    if (!salesOrderId || !mongoose.Types.ObjectId.isValid(salesOrderId)) {
      return res.status(400).json({ success: false, message: 'A sales order is required.' });
    }

    const sale = await SalesOrder.findOne({ _id: salesOrderId, tenantId: req.tenantId })
      .populate('customerId', 'name phone address');
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sales order not found.' });
    }
    if (sale.status === 'voided') {
      return res.status(400).json({ success: false, message: 'Cannot ship a voided sale.' });
    }

    // Validate package contents against what's still shippable per line.
    const assignedPerLine = new Map();
    const builtPackages = [];
    let pkgNumber = 0;
    for (const pkg of packages || []) {
      pkgNumber += 1;
      const pkgItems = [];
      for (const pi of pkg.items || []) {
        const line = sale.items.id(pi.orderItemId);
        if (!line) {
          return res.status(400).json({ success: false, message: 'A package references a line that is not on this order.' });
        }
        const qty = Number(pi.quantity);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const key = String(line._id);
        const already = assignedPerLine.get(key) || 0;
        // A backordered line's un-arrived shortfall can't be packed — only
        // units physically here (reserved or already allocated) can ship.
        // packedQty counts units sitting in OTHER not-yet-dispatched
        // shipments (dispatch converts them to shippedQty), so the same
        // units can't be packed into two open shipments at once.
        const shippable = Number(line.quantity) - Number(line.cancelledQty || 0)
          - Number(line.shippedQty || 0) - Number(line.backorderedQty || 0)
          - Number(line.packedQty || 0) - already;
        if (qty > shippable) {
          return res.status(400).json({
            success: false,
            message: `Cannot pack ${qty} × "${line.name}" — only ${Math.max(0, shippable)} unit(s) left to ship.`,
          });
        }
        assignedPerLine.set(key, already + qty);
        pkgItems.push({
          productId: line.productId, name: line.name, sku: line.sku,
          quantity: qty, orderItemId: line._id,
        });
      }
      if (pkgItems.length > 0) {
        builtPackages.push({
          packageNumber: pkgNumber,
          weightKg: Number(pkg.weightKg) || undefined,
          dimensions: pkg.dimensions || undefined,
          items: pkgItems,
        });
      }
    }

    if (builtPackages.length === 0) {
      return res.status(400).json({ success: false, message: 'A shipment needs at least one package with items.' });
    }

    const resolvedShipTo = (shipToAddress && shipToAddress.address) ? shipToAddress
      : (sale.shippingAddress?.address ? sale.shippingAddress : {
          name: sale.customerId?.name || sale.customerName || 'Customer',
          phone: sale.customerId?.phone || '',
          address: sale.customerId?.address || '',
        });

    const shipmentNumber = await nextDocNumber(Shipment, req.tenantId, 'SH', 'shipmentNumber');
    const shipment = await Shipment.create({
      tenantId: req.tenantId,
      shipmentNumber,
      salesOrderId: sale._id,
      orderNumber: sale.orderNumber,
      branchId: sale.branchId,
      picklistId: picklistId && mongoose.Types.ObjectId.isValid(picklistId) ? picklistId : undefined,
      customerId: sale.customerId?._id || undefined,
      shipToAddress: resolvedShipTo,
      status: 'packed',
      carrier: carrier || undefined,
      packages: builtPackages,
      origin: 'branch',
      createdBy: req.user._id,
      notes,
    });

    // Record packing progress on the order lines and pull the order into the
    // fulfillment pipeline if it wasn't already.
    for (const [lineId, qty] of assignedPerLine.entries()) {
      const line = sale.items.id(lineId);
      if (!line) continue;
      line.packedQty = Number(line.packedQty || 0) + qty;
      if (['open', 'allocated', 'picked'].includes(line.lineStatus)
        && line.packedQty >= Number(line.quantity) - Number(line.cancelledQty || 0)) {
        line.lineStatus = 'packed';
      }
    }
    if (sale.fulfillmentStatus === 'not_required') sale.fulfillmentStatus = 'pending';
    await sale.save();

    res.status(201).json({ success: true, data: shipment });
  } catch (error) {
    console.error('Create shipment error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE SHIPMENT (carrier / address / notes) ─────────────────────────────
exports.updateShipment = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const shipment = await Shipment.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found.' });
    }
    if (['delivered', 'cancelled'].includes(shipment.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit a ${shipment.status} shipment.` });
    }

    // Only these fields are editable after creation — package contents drive
    // packedQty bookkeeping on the order, so they're fixed once created
    // (cancel and recreate the shipment to change them).
    const { carrier, shipToAddress, notes } = req.body;
    if (carrier) shipment.carrier = carrier;
    if (shipToAddress) shipment.shipToAddress = shipToAddress;
    if (notes !== undefined) shipment.notes = notes;
    await shipment.save();

    res.json({ success: true, data: shipment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DISPATCH ─────────────────────────────────────────────────────────────────
// The moment goods leave the building: writes shippedQty onto the order lines
// and recomputes the order's fulfillmentStatus. Guarded by a conditional
// update on status so a double-click can't double-count shippedQty.
exports.dispatchShipment = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const shipment = await Shipment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $in: ['draft', 'packed'] } },
      { $set: { status: 'dispatched', shippedAt: new Date() } },
      { new: true }
    );
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found or already dispatched/cancelled.' });
    }

    const sale = await SalesOrder.findOne({ _id: shipment.salesOrderId, tenantId: req.tenantId });
    if (sale) {
      for (const pkg of shipment.packages) {
        for (const pi of pkg.items) {
          const line = sale.items.id(pi.orderItemId);
          if (!line) continue;
          const maxShippable = Number(line.quantity) - Number(line.cancelledQty || 0);
          line.shippedQty = Math.min(maxShippable, Number(line.shippedQty || 0) + Number(pi.quantity));
          // These units are no longer "packed awaiting dispatch" — see the
          // shippable calculation in createShipment.
          line.packedQty = Math.max(0, Number(line.packedQty || 0) - Number(pi.quantity));
          if (line.shippedQty >= maxShippable) line.lineStatus = 'shipped';
        }
      }
      recomputeFulfillmentStatus(sale);
      await sale.save();
    }

    res.json({ success: true, message: 'Shipment dispatched.', data: shipment });
  } catch (error) {
    console.error('Dispatch shipment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE STATUS (post-dispatch tracking) ───────────────────────────────────
// Manual tracking updates only — there is no carrier-webhook integration.
exports.updateShipmentStatus = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { status } = req.body;
    const allowed = ['in_transit', 'delivered', 'returned'];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowed.join(', ')}. Use /dispatch to dispatch, DELETE to cancel.`,
      });
    }

    const shipment = await Shipment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $in: ['dispatched', 'in_transit'] } },
      { $set: { status, ...(status === 'delivered' ? { deliveredAt: new Date() } : {}) } },
      { new: true }
    );
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found or not in a trackable state (dispatch it first).' });
    }

    res.json({ success: true, data: shipment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CANCEL SHIPMENT (pre-dispatch only) ──────────────────────────────────────
// Reverts the packedQty bookkeeping the shipment added. Post-dispatch, use
// status 'returned' instead — the goods actually left.
exports.cancelShipment = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const shipment = await Shipment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $in: ['draft', 'packed'] } },
      { $set: { status: 'cancelled' } },
      { new: true }
    );
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found or already dispatched (mark it returned instead).' });
    }

    const sale = await SalesOrder.findOne({ _id: shipment.salesOrderId, tenantId: req.tenantId });
    if (sale) {
      for (const pkg of shipment.packages) {
        for (const pi of pkg.items) {
          const line = sale.items.id(pi.orderItemId);
          if (!line) continue;
          line.packedQty = Math.max(0, Number(line.packedQty || 0) - Number(pi.quantity));
          if (line.lineStatus === 'packed') {
            line.lineStatus = Number(line.pickedQty || 0) > 0 ? 'picked' : 'open';
          }
        }
      }
      await sale.save();
    }

    res.json({ success: true, message: 'Shipment cancelled.', data: shipment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── STAMP LABEL PRINTED ──────────────────────────────────────────────────────
exports.markLabelPrinted = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const shipment = await Shipment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: { labelPrintedAt: new Date() } },
      { new: true }
    );
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found.' });
    }
    res.json({ success: true, data: shipment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
