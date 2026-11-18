const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
  },
  purchaseOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
  },
  type: {
    type: String,
    enum: ['sale', 'purchase'],
    default: 'sale',
  },
  method: {
    type: String,
    enum: ['cash', 'card', 'mobile_money'],
  },
  amount: Number,
  reference: String,
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed', 'refunded'],
    default: 'completed',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Payment', paymentSchema);
