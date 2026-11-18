const mongoose = require('mongoose');

const priceListItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  customPrice: { type: Number, min: 0 },
}, { _id: false });

// A named price scheme assignable to customers (e.g. "Wholesale", "VIP").
// Two flavors: 'percent' applies a signed percentage to every product's
// standard price (-10 = 10% off, +20 = 20% markup); 'per_item' overrides
// specific products' prices and leaves everything else at standard price.
// Applied at the POS when a customer with a priceListId is selected — the
// standard price stays the fallback for anything the list doesn't cover.
const priceListSchema = new mongoose.Schema({
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
  description: String,
  type: {
    type: String,
    enum: ['percent', 'per_item'],
    default: 'per_item',
  },
  // percent type only; signed. Clamped so a discount can't exceed -100%.
  percentage: {
    type: Number,
    default: 0,
    min: -100,
  },
  items: [priceListItemSchema],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

priceListSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('PriceList', priceListSchema);
