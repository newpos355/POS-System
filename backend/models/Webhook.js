const mongoose = require('mongoose');

// An outbound webhook endpoint. Subscribed events POST a JSON envelope
// {event, timestamp, data} to `url`, signed with HMAC-SHA256 of the raw body
// using `secret` (header X-ApexPOS-Signature) so the receiver can verify
// authenticity. Deliveries are attempted by services/webhookDispatcher.js,
// which also appends to the capped `deliveries` log below. A webhook can be
// triggered two ways: automatically for any event in `events`, or explicitly
// as a workflow/function action referencing it by id.
const deliverySchema = new mongoose.Schema({
  event: String,
  at: { type: Date, default: Date.now },
  success: Boolean,
  statusCode: Number,
  error: String,
  durationMs: Number,
}, { _id: false });

const webhookSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  // Signing secret, generated server-side at creation.
  secret: { type: String, required: true },
  // Events that fire this hook automatically (may be empty for hooks only
  // used as explicit workflow actions).
  events: [String],
  isActive: { type: Boolean, default: true },

  // Rolling delivery log — newest first, capped at 20 by the dispatcher.
  deliveries: [deliverySchema],
  failureCount: { type: Number, default: 0 },
  lastStatus: { type: String, enum: ['ok', 'failed', null], default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

webhookSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model('Webhook', webhookSchema);
