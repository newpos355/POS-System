const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'low_stock',       // Product stock below reorder level
      'out_of_stock',    // Product stock = 0
      'new_sale',        // Sale completed
      'new_purchase',    // Purchase order created/received
      'new_customer',    // New customer registered
      'payment_received',// Payment confirmed
      'system',          // Generic system message
      'alert',           // Important alert
    ],
    required: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  // Optional link to navigate to when clicked
  actionUrl: {
    type: String,
    default: null,
  },
  // Optional reference to related document
  refId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  refModel: {
    type: String,
    default: null,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

notificationSchema.index({ tenantId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
