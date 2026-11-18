const mongoose = require('mongoose');
const actionSchema = require('./actionSchema');

// A workflow rule: WHEN <triggerEvent> happens and ALL/ANY <conditions> match
// the event's context, run <actions> (email alerts, webhooks, in-app
// notifications, field updates). Events are emitted from the business
// controllers via services/automationEngine.emitEvent — see EVENT_CATALOG
// there for the list of events and the context fields conditions can test.
const conditionSchema = new mongoose.Schema({
  // Dot-path into the event context, e.g. 'order.total', 'customer.name'.
  field: { type: String, required: true },
  operator: {
    type: String,
    enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains', 'is_empty', 'not_empty'],
    default: 'eq',
  },
  value: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const workflowSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  triggerEvent: { type: String, required: true },
  conditions: [conditionSchema],
  conditionLogic: { type: String, enum: ['and', 'or'], default: 'and' },
  actions: {
    type: [actionSchema],
    validate: [(v) => v.length > 0, 'A workflow needs at least one action.'],
  },
  isActive: { type: Boolean, default: true },

  // Run bookkeeping (updated by the engine, informational only).
  runCount: { type: Number, default: 0 },
  lastRunAt: Date,
  lastStatus: { type: String, enum: ['ok', 'partial', 'failed', null], default: null },
  lastError: String,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

workflowSchema.index({ tenantId: 1, triggerEvent: 1, isActive: 1 });

module.exports = mongoose.model('Workflow', workflowSchema);
