const mongoose = require('mongoose');
const Waybill = require('../models/Waybill');
const Shipment = require('../models/Shipment');
const { nextDocNumber } = require('../utils/docNumber');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── LIST WAYBILLS ────────────────────────────────────────────────────────────
exports.getWaybills = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const query = { tenantId: req.tenantId };
    if (req.query.status) query.status = req.query.status;
    if (req.query.shipmentId && mongoose.Types.ObjectId.isValid(req.query.shipmentId)) {
      query.shipmentId = req.query.shipmentId;
    }

    const waybills = await Waybill.find(query)
      .populate('shipmentId', 'shipmentNumber')
      .populate('generatedBy', 'name')
      .sort('-createdAt')
      .limit(parseInt(req.query.limit) || 200);

    res.json({ success: true, data: waybills });
  } catch (error) {
    console.error('Get waybills error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET SINGLE WAYBILL ───────────────────────────────────────────────────────
exports.getWaybill = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const waybill = await Waybill.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('shipmentId', 'shipmentNumber orderNumber')
      .populate('generatedBy', 'name');

    if (!waybill) {
      return res.status(404).json({ success: false, message: 'Waybill not found.' });
    }
    res.json({ success: true, data: waybill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE WAYBILL ───────────────────────────────────────────────────────────
// A self-contained printable transport document. NOT a government e-way-bill
// portal filing — see the note on the model.
exports.createWaybill = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const {
      shipmentId, salesOrderId, documentType, consignor, consignee,
      transporter, distanceKm, goods, notes,
    } = req.body;

    if (!consignor?.name || !consignee?.name) {
      return res.status(400).json({ success: false, message: 'Consignor and consignee names are required.' });
    }
    if (!goods || goods.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one goods line is required.' });
    }

    let shipment = null;
    if (shipmentId && mongoose.Types.ObjectId.isValid(shipmentId)) {
      shipment = await Shipment.findOne({ _id: shipmentId, tenantId: req.tenantId });
      if (!shipment) {
        return res.status(400).json({ success: false, message: 'Linked shipment not found.' });
      }
    }

    const normalizedGoods = goods.map((g) => ({
      description: g.description || '',
      quantity: Number(g.quantity) || 0,
      unit: g.unit || 'piece',
      taxableValue: Number(g.taxableValue) || 0,
      taxAmount: Number(g.taxAmount) || 0,
    }));
    const totalValue = normalizedGoods.reduce((sum, g) => sum + g.taxableValue + g.taxAmount, 0);

    const waybillNumber = await nextDocNumber(Waybill, req.tenantId, 'WB', 'waybillNumber');
    const waybill = await Waybill.create({
      tenantId: req.tenantId,
      waybillNumber,
      shipmentId: shipment?._id,
      salesOrderId: salesOrderId && mongoose.Types.ObjectId.isValid(salesOrderId) ? salesOrderId : shipment?.salesOrderId,
      documentType: documentType || 'sale',
      consignor,
      consignee,
      transporter,
      distanceKm: Number(distanceKm) || undefined,
      goods: normalizedGoods,
      totalValue,
      status: 'active',
      generatedBy: req.user._id,
      notes,
    });

    res.status(201).json({ success: true, data: waybill });
  } catch (error) {
    console.error('Create waybill error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE WAYBILL ───────────────────────────────────────────────────────────
exports.updateWaybill = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const existing = await Waybill.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Waybill not found.' });
    }
    if (existing.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot edit a cancelled waybill.' });
    }

    // See customerController.updateCustomer for why tenantId/_id are stripped.
    const { tenantId, _id, waybillNumber, generatedBy, ...safeBody } = req.body;
    if (Array.isArray(safeBody.goods)) {
      safeBody.totalValue = safeBody.goods.reduce(
        (sum, g) => sum + (Number(g.taxableValue) || 0) + (Number(g.taxAmount) || 0), 0);
    }
    const updated = await Waybill.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      safeBody,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CANCEL WAYBILL ───────────────────────────────────────────────────────────
exports.cancelWaybill = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const waybill = await Waybill.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: { $ne: 'cancelled' } },
      { $set: { status: 'cancelled', cancelReason: req.body.reason || 'Cancelled' } },
      { new: true }
    );
    if (!waybill) {
      return res.status(404).json({ success: false, message: 'Waybill not found or already cancelled.' });
    }
    res.json({ success: true, data: waybill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
