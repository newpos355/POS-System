const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  address: {
    type: String,
  },
  totalPurchases: {
    type: Number,
    default: 0,
  },
  totalSpent: {
    type: Number,
    default: 0,
  },
  outstandingCredit: {
    type: Number,
    default: 0,    // total unpaid credit balance (debt the customer owes)
  },
  creditBlocked: {
    type: Boolean,
    default: false, // admin can block new credit sales for this customer
  },
  // Deliberately separate from outstandingCredit — this is store credit the
  // business owes the customer (from returns/refunds), not debt they owe.
  // See models/CreditNote.js for the ledger this balance is derived from.
  storeCreditBalance: {
    type: Number,
    default: 0,
  },
  // Price list applied to this customer at the POS (see models/PriceList.js).
  // Null = standard prices.
  priceListId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PriceList',
    default: null,
  },
  // Tax exemption (NGOs, diplomats, export customers...): sales to this
  // customer carry zero tax at the POS.
  taxExempt: {
    type: Boolean,
    default: false,
  },
  taxExemptReason: String,

  // Free-form annotations; also the one plain field automation update_field
  // actions are allowed to write (see services/automationEngine.js).
  notes: {
    type: String,
    default: '',
  },

  // Tenant-defined extra fields, keyed by CustomField.key (definitions live
  // in models/CustomField.js; values render via frontend CustomFieldsSection).
  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

}, {
  timestamps: true,
});

module.exports = mongoose.model('Customer', customerSchema);
