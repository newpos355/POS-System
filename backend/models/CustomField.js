const mongoose = require('mongoose');

// A tenant-defined extra field on a core entity. Definitions live here;
// the VALUES live on the entity documents themselves under `customFields`
// (a Mixed map keyed by this definition's `key`), so reading a record never
// needs a join. Forms fetch the active definitions for their entity and
// render matching inputs (see frontend CustomFieldsSection).
const customFieldSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  entity: {
    type: String,
    enum: ['product', 'customer', 'salesOrder', 'vendor'],
    required: true,
  },
  label: { type: String, required: true, trim: true },
  // Machine key derived from the label at creation (slugged, immutable after
  // create so stored values never orphan).
  key: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['text', 'textarea', 'number', 'date', 'select', 'checkbox'],
    default: 'text',
  },
  // For type 'select'.
  options: [String],
  required: { type: Boolean, default: false },
  defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

customFieldSchema.index({ tenantId: 1, entity: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('CustomField', customFieldSchema);
