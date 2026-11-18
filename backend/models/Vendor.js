const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  phone: {
    type: String,
  },
  company: {
    type: String,
  },
  address: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  // Vendor ships orders directly to customers (dropshipping) — required for a
  // product's dropship POs to be routed to this vendor.
  isDropshipper: {
    type: Boolean,
    default: false,
  },
  // Typical days from PO to delivery; used to prefill expected dates.
  leadTimeDays: {
    type: Number,
    default: null,
  },
  // Tenant-defined extra fields, keyed by CustomField.key.
  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Vendor', vendorSchema);
