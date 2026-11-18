const mongoose = require('mongoose');

// A saved, filtered slice of a core entity that renders as its own module
// page (e.g. "High-value credit sales", "Low stock electronics"). The server
// executes the view (customizationController.getViewData) against a strict
// per-entity field whitelist — filters/columns/sort can only reference
// catalogued fields, never raw Mongo operators from the client.
const viewFilterSchema = new mongoose.Schema({
  field: { type: String, required: true },
  operator: {
    type: String,
    enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains'],
    default: 'eq',
  },
  value: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const customViewSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  entity: {
    type: String,
    enum: ['sales', 'products', 'customers', 'vendors'],
    required: true,
  },
  filters: [viewFilterSchema],
  // Which catalogued fields show as table columns, in order.
  columns: [String],
  sort: {
    field: { type: String, default: 'createdAt' },
    direction: { type: String, enum: ['asc', 'desc'], default: 'desc' },
  },
  // Shared views are visible to every user in the tenant; private ones only
  // to their creator.
  isShared: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

customViewSchema.index({ tenantId: 1, entity: 1 });

module.exports = mongoose.model('CustomView', customViewSchema);
