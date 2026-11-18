const mongoose = require('mongoose');
const actionSchema = require('./actionSchema');

// A named, reusable sequence of automation actions that runs outside the
// event workflows, triggered one of two ways:
//   type 'button'    — appears as a custom button on the record page of
//                      `entity` (e.g. a "Email invoice copy" button on a
//                      sale); POST /api/automation/functions/:id/run with a
//                      recordId executes it against that record's context.
//   type 'scheduler' — runs unattended on `schedule` (hourly/daily/weekly/
//                      monthly), claimed and executed by the function
//                      scheduler in services/automationEngine.js using the
//                      same conditional-nextRunAt pattern as reportRunner.
const customFunctionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  type: { type: String, enum: ['button', 'scheduler'], required: true },

  // For 'button': which record page shows it.
  entity: {
    type: String,
    enum: ['salesOrder', 'customer', 'product', null],
    default: null,
  },

  actions: {
    type: [actionSchema],
    validate: [(v) => v.length > 0, 'A function needs at least one action.'],
  },

  // For 'scheduler'.
  schedule: {
    frequency: { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly'], default: 'daily' },
    hour: { type: Number, default: 7, min: 0, max: 23 },
    dayOfWeek: { type: Number, default: 1, min: 0, max: 6 },
    dayOfMonth: { type: Number, default: 1, min: 1, max: 28 },
  },
  nextRunAt: Date,

  isActive: { type: Boolean, default: true },
  runCount: { type: Number, default: 0 },
  lastRunAt: Date,
  lastStatus: { type: String, enum: ['ok', 'partial', 'failed', null], default: null },
  lastError: String,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

customFunctionSchema.index({ tenantId: 1, type: 1 });
customFunctionSchema.index({ isActive: 1, type: 1, nextRunAt: 1 });

module.exports = mongoose.model('CustomFunction', customFunctionSchema);
