const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
  },
  address: {
    type: String,
  },
  plan: {
    type: String,
    enum: ['none', 'free', 'starter', 'business', 'enterprise'],
    default: 'none',
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'cancelled'],
    default: 'active',
  },
  trialEndsAt: {
    type: Date,
  },
  addOns: {
    extraUsers: { type: Number, default: 0 },
    extraBranches: { type: Number, default: 0 },
    smsCredits: { type: Number, default: 0 },
  },
  notes: {
    type: String,
    default: '',
  },
  suspendReason: {
    type: String,
    default: '',
  },
  suspendedAt: {
    type: Date,
  },
  settings: {
    currency: { type: String, default: 'USD' },
    taxRate: { type: Number, default: 0 },
    timezone: { type: String, default: 'UTC' },
    dateFormat: { type: String, default: 'MM/DD/YYYY' },
    returns: {
      // Off by default so tenants already using returns as an instant
      // create-and-restock action see no behavior change until an admin
      // opts in.
      requireApproval: { type: Boolean, default: false },
      approvalThreshold: { type: Number, default: null },
    },
  },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  planExpiresAt: { type: Date },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Tenant', tenantSchema);
