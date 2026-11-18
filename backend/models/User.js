const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: function() {
      return this.role !== 'superadmin';
    },
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'cashier', 'superadmin'],
    default: 'cashier',
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
  },
  phone: {
    type: String,
  },
  avatar: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  otpCode:             { type: String, select: false },  // stored as bcrypt hash
  otpExpire:           Date,
  resetPasswordToken:  { type: String, select: false },  // stored as bcrypt hash
  resetPasswordExpire: Date,
  // Bumped on password change/reset so previously issued JWTs (tv claim) are
  // rejected immediately instead of staying valid until natural expiry.
  tokenVersion: { type: Number, default: 0 },
}, {
  timestamps: true,
});

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

userSchema.pre('save', async function() {
  // Hash password if modified
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password || !enteredPassword) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// ── Static helpers for hashed token/OTP storage ──────────────────────────────
// Hash a plain-text code before saving to DB
userSchema.statics.hashCode = async (plainCode) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainCode, salt);
};

// Verify a plain-text code against the stored hash
userSchema.statics.verifyCode = async (plainCode, hash) => {
  if (!plainCode || !hash) return false;
  return bcrypt.compare(plainCode, hash);
};

module.exports = mongoose.model('User', userSchema);
