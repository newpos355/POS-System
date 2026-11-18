const mongoose = require('mongoose');

// A reusable email layout with {{placeholder}} variables. Workflow email
// actions (and test sends) render subject/bodyHtml through
// services/templateRenderer.js against the event's context — e.g.
// "Hi {{customer.name}}, your order {{order.number}} totalled {{order.total}}".
const emailTemplateSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  // HTML body. Placeholder values are HTML-escaped at render time, except
  // documented block placeholders like {{items_table}}.
  bodyHtml: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

emailTemplateSchema.index({ tenantId: 1, name: 1 });

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
