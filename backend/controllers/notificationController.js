const mongoose = require('mongoose');
const Notification = require('../models/Notification');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── HELPER: Create a notification (called internally from other controllers) ───
exports.createNotification = async ({ tenantId, type, priority = 'medium', title, message, actionUrl = null, refId = null, refModel = null }) => {
  try {
    if (!isDbConnected()) return;
    await Notification.create({ tenantId, type, priority, title, message, actionUrl, refId, refModel });
  } catch (err) {
    console.error('Create notification error:', err.message);
  }
};

// ─── GET ALL NOTIFICATIONS ────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;

    const query = { tenantId: req.tenantId };
    if (req.query.unread === 'true') query.isRead = false;
    if (req.query.type) query.type = req.query.type;

    const [total, notifications, unreadCount] = await Promise.all([
      Notification.countDocuments(query),
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ tenantId: req.tenantId, isRead: false }),
    ]);

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET UNREAD COUNT ONLY ───────────────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }
  try {
    const count = await Notification.countDocuments({ tenantId: req.tenantId, isRead: false });
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── MARK ONE AS READ ────────────────────────────────────────────────────────
exports.markAsRead = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── MARK ALL AS READ ────────────────────────────────────────────────────────
exports.markAllAsRead = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }
  try {
    await Notification.updateMany(
      { tenantId: req.tenantId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE ONE NOTIFICATION ─────────────────────────────────────────────────
exports.deleteNotification = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE ALL READ NOTIFICATIONS ───────────────────────────────────────────
exports.clearRead = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }
  try {
    await Notification.deleteMany({ tenantId: req.tenantId, isRead: true });
    res.json({ success: true, message: 'Read notifications cleared.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
