const mongoose = require('mongoose');

// A named tax rate (e.g. "VAT 18%", "Service Levy 5%", "Zero-rated 0%").
// Products reference one via Product.taxRateId; the numeric rate is also
// denormalized onto Product.taxRate at save time so the POS and receipts
// never need a join. Exactly one rate can be the tenant default — it applies
// to products with no rate of their own.
const taxRateSchema = new mongoose.Schema({
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
  // Percent, e.g. 18 for 18%. Zero is valid (zero-rated goods).
  rate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

taxRateSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('TaxRate', taxRateSchema);
