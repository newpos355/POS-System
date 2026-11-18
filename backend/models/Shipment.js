const mongoose = require('mongoose');

const packageItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  sku: String,
  quantity: Number,
  orderItemId: { type: mongoose.Schema.Types.ObjectId },
}, { _id: false });

const packageSchema = new mongoose.Schema({
  packageNumber: Number,          // 1-based, "package 2 of 3" on the label
  weightKg: Number,
  dimensions: String,             // free text, e.g. "40x30x20 cm"
  items: [packageItemSchema],
});

// Tracks the physical journey of goods after a sale. Like Picklist, this
// never mutates stock — dispatching only writes shippedQty back onto the
// sales order lines and recomputes the order's fulfillmentStatus.
const shipmentSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  shipmentNumber: {
    type: String,
    required: true,
  },
  salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  orderNumber: String,
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  picklistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Picklist' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  shipToAddress: {
    name: String,
    phone: String,
    address: String,
    city: String,
    notes: String,
  },
  status: {
    type: String,
    enum: ['draft', 'packed', 'dispatched', 'in_transit', 'delivered', 'returned', 'cancelled'],
    default: 'draft',
  },
  carrier: {
    name: String,
    service: String,
    trackingNumber: String,
    trackingUrl: String,
  },
  packages: [packageSchema],
  // 'vendor' shipments are auto-created when a dropship PO is received —
  // the goods went straight from the vendor to the customer.
  origin: {
    type: String,
    enum: ['branch', 'vendor'],
    default: 'branch',
  },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shippedAt: Date,
  deliveredAt: Date,
  labelPrintedAt: Date,
  notes: String,
}, {
  timestamps: true,
});

// Numbering scoped per tenant, same as SalesOrder/PurchaseOrder/Return.
shipmentSchema.index({ tenantId: 1, shipmentNumber: 1 }, { unique: true });

module.exports = mongoose.model('Shipment', shipmentSchema);
