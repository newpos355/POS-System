const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name: String,
  sku: String,
  price: Number,
  costPrice: Number,
  barcode: String
});

const productSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  sku: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  costPrice: {
    type: Number,
    default: 0,
    min: 0,
  },
  taxRate: {
    type: Number,
    default: 0,
  },
  // Named tax rate this product uses (see models/TaxRate.js). When set, the
  // numeric `taxRate` above is kept in sync by productController so the POS
  // reads one denormalized number. Null = use the tenant's default rate.
  taxRateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxRate',
    default: null,
  },
  barcode: {
    type: String,
  },
  // Primary image URL (singular — used by POS terminal & product list)
  image: {
    type: String,
    default: '',
  },
  // All image URLs
  images: [{
    type: String,
  }],
  // Current stock level (synced with Inventory collection)
  stock: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Low stock warning threshold
  reorderLevel: {
    type: Number,
    default: 10,
  },
  variants: [variantSchema],
  unit: {
    type: String,
    default: 'piece',
  },
  // Sold by weight: the POS asks for a weight (manual entry or a connected
  // scale) instead of counting units — quantities on these lines are
  // fractional (e.g. 0.735 kg) and `price` is per unit of weight.
  soldByWeight: {
    type: Boolean,
    default: false,
  },
  attributes: {
    size: String,
    color: String,
    imei: String,
    serialNumber: String,
    weight: String,
    warranty: String,
    brand: String,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft'],
    default: 'Active',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  // ── Unit tracking ───────────────────────────────────────────────────────────
  // 'serial': every unit has a unique serial (see models/SerialNumber.js) —
  // checkout must name the exact serials being sold. 'batch': stock belongs
  // to lots with expiry dates (models/Batch.js) — checkout consumes lots
  // FEFO automatically. 'none' (default) keeps plain counted stock, so every
  // pre-existing product behaves exactly as before.
  trackingType: {
    type: String,
    enum: ['none', 'serial', 'batch'],
    default: 'none',
  },

  // ── Composite item (bundle/kit) ─────────────────────────────────────────────
  // A composite is assembled on the fly at sale time: selling one bundle
  // atomically deducts each component's stock (never the composite's own
  // stock, which stays untracked). components[].quantity is per ONE bundle.
  isComposite: {
    type: Boolean,
    default: false,
  },
  components: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: { type: Number, min: 0 },
  }],

  // ── Fulfillment sourcing ────────────────────────────────────────────────────
  // Default vendor used when auto-creating replenishment/dropship POs.
  preferredVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
  },
  // Sale of this product may proceed even when stock is short — the shortfall
  // is recorded as a backorder instead of rejecting the checkout. The client
  // must ALSO opt in per sale; this server-side flag alone never forces it.
  allowBackorder: {
    type: Boolean,
    default: false,
  },
  // Product is eligible to be drop-shipped from preferredVendorId straight to
  // the customer (its sale lines skip local stock entirely).
  isDropship: {
    type: Boolean,
    default: false,
  },
  // ── Expiry Date Tracking ────────────────────────────────────────────────────
  expiryDate: {
    type: Date,
    default: null,
  },
  // Alert threshold: warn X days before expiry (default 30 days)
  expiryAlertDays: {
    type: Number,
    default: 30,
  },
  // Free-form annotations; also the one plain field automation update_field
  // actions are allowed to write (see services/automationEngine.js).
  notes: {
    type: String,
    default: '',
  },
  // Tenant-defined extra fields, keyed by CustomField.key.
  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  }
}, {
  timestamps: true,
});

productSchema.index({ tenantId: 1, sku: 1 }, { unique: true });
productSchema.index({ tenantId: 1, name: 'text' });

module.exports = mongoose.model('Product', productSchema);
