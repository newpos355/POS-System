const mongoose = require('mongoose');
const User = require('../models/User');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── GET USERS ─────────────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const users = await User.find({ tenantId: req.tenantId })
      .select('-password')
      .populate('branchId', 'name')
      .sort('-createdAt');

    res.json({
      success: true,
      data: users,
      pagination: { page: 1, limit: 100, total: users.length, pages: 1 },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET USER ──────────────────────────────────────────────────────────────────
exports.getUser = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .select('-password')
      .populate('branchId', 'name');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper to normalize phone
const normalizePhone = (phone) => {
  if (!phone || !phone.trim()) return undefined;
  let p = phone.trim().replace(/\s+/g, '').replace(/-/g, '');
  if (!p.startsWith('+')) p = '+' + p;
  return /^\+\d{7,15}$/.test(p) ? p : undefined;
};

// ─── CREATE USER (for Settings → Users) ───────────────────────────────────────
exports.createUser = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { name, email, password, role, branchId, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    // Normalize email to lowercase so login always works
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user with same email exists in this tenant
    const existing = await User.findOne({ email: normalizedEmail, tenantId: req.tenantId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists in your store.' });
    }

    const normalizedPhone = normalizePhone(phone);

    const user = await User.create({
      tenantId: req.tenantId,    // Scoped to the admin's tenant
      name: name.trim(),
      email: normalizedEmail,    // Always stored lowercase
      password: password.trim(), // Trim leading/trailing whitespace
      role: role || 'cashier',
      branchId: branchId || undefined,
      phone: normalizedPhone,
      isActive: true,
    });

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({ success: true, data: userObj });
  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already in use.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE USER ───────────────────────────────────────────────────────────────
exports.updateUser = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { name, email, role, branchId, isActive, password, phone } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase(); // Always lowercase
    if (role !== undefined) updateData.role = role;
    if (branchId !== undefined) updateData.branchId = branchId;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (phone !== undefined) updateData.phone = normalizePhone(phone) || phone.trim();

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // If password is being changed, update it separately (triggers pre-save hash)
    if (password && password.trim().length >= 6) {
      const fullUser = await User.findById(user._id);
      fullUser.password = password.trim();
      await fullUser.save();
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE USER ───────────────────────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    // Prevent self-deletion
    const myId = (req.user._id || req.user.id)?.toString();
    if (req.params.id === myId) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }

    await User.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
