const mongoose = require('mongoose');

// A recurring report subscription: which report, how often, and who gets it
// by email. The scheduler (services/reportRunner.js) polls for schedules
// whose nextRunAt has passed, generates the report through the same shared
// builders the Reports screen uses, emails it, and advances nextRunAt.
const reportScheduleSchema = new mongoose.Schema({
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
  reportType: {
    type: String,
    enum: ['receivables', 'payables', 'sales-summary', 'custom'],
    required: true,
  },
  // For reportType 'custom': the builder config {entity, groupBy, metrics}.
  // The date range is always the period since the previous run.
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily',
  },
  // Hour of day (0-23, server time) the report should go out.
  hour: { type: Number, default: 7, min: 0, max: 23 },
  // weekly: 0 (Sunday) – 6 (Saturday); monthly: 1-28.
  dayOfWeek: { type: Number, default: 1, min: 0, max: 6 },
  dayOfMonth: { type: Number, default: 1, min: 1, max: 28 },
  recipients: [String],
  isActive: { type: Boolean, default: true },
  nextRunAt: Date,
  lastRunAt: Date,
  lastStatus: { type: String, enum: ['sent', 'email_failed', 'failed', null], default: null },
  lastError: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

reportScheduleSchema.index({ isActive: 1, nextRunAt: 1 });

module.exports = mongoose.model('ReportSchedule', reportScheduleSchema);
