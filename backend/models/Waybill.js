const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
  name: String,
  phone: String,
  address: String,
}, { _id: false });

const goodsLineSchema = new mongoose.Schema({
  description: String,
  quantity: Number,
  unit: String,
  taxableValue: Number,
  taxAmount: Number,
}, { _id: false });

// A self-contained, printable transport document (consignor, consignee,
// transporter, vehicle, goods, value). This is an INTERNAL waybill only —
// it is NOT a government GST e-way-bill-portal filing and makes no attempt
// to talk to any tax authority's API.
const waybillSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  waybillNumber: {
    type: String,
    required: true,
  },
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment' },
  salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  documentType: {
    type: String,
    enum: ['sale', 'transfer', 'dropship', 'return'],
    default: 'sale',
  },
  consignor: partySchema,
  consignee: partySchema,
  transporter: {
    name: String,
    contactPhone: String,
    vehicleNumber: String,
    mode: { type: String, enum: ['road', 'rail', 'air', 'ship'], default: 'road' },
  },
  distanceKm: Number,
  goods: [goodsLineSchema],
  totalValue: Number,
  status: {
    type: String,
    enum: ['draft', 'active', 'cancelled'],
    default: 'active',
  },
  cancelReason: String,
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
}, {
  timestamps: true,
});

// Numbering scoped per tenant, same as SalesOrder/PurchaseOrder/Return.
waybillSchema.index({ tenantId: 1, waybillNumber: 1 }, { unique: true });

module.exports = mongoose.model('Waybill', waybillSchema);
