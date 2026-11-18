const mongoose = require('mongoose');
const twilio = require('twilio');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { generateToken: signToken } = require('../utils/token');

const generateToken = (id, tenantId, role, tokenVersion = 0) =>
  signToken(id, tenantId, role, tokenVersion, '8h');

const isDbConnected = () => mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2;

// Use API Key auth or Auth Token fallback
const getTwilioClient = () => {
  if (process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET) {
    return twilio(
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { accountSid: process.env.TWILIO_ACCOUNT_SID }
    );
  }
  return twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
};

// Normalize phone → E.164 format (+923180505202, +256712345678)
const normalizePhone = (phone) => {
  let p = phone.replace(/\s+/g, '').replace(/-/g, '');
  if (!p.startsWith('+')) p = '+' + p;
  return p;
};

// Find user by flexible phone match, optionally scoped to a specific tenant
// Selects +otpCode so bcrypt verification works in verifyOTP
const findUserByPhone = async (rawPhone, tenantId = null) => {
  const norm = normalizePhone(rawPhone);
  const digitsOnly = norm.replace(/\D/g, '');
  const last9 = digitsOnly.slice(-9);

  const query = {
    isActive: true,
    $or: [
      { phone: norm },
      { phone: rawPhone.trim() },
      { phone: { $regex: last9 + '$' } }
    ]
  };

  // Scope to a specific tenant when provided to prevent cross-tenant phone collisions
  if (tenantId) query.tenantId = tenantId;

  return await User.findOne(query).select('+otpCode');
};

// ─── SEND OTP via SMS ─────────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
  if (!isDbConnected())
    return res.status(503).json({ success: false, message: 'Database not available.' });

  try {
    const { phone, businessEmail } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required.' });

    const normalizedPhone = normalizePhone(phone);

    // Validate format
    if (!/^\+\d{7,15}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format. Include country code (e.g. +923180505202 or +256712345678).' });
    }

    // Resolve tenant if businessEmail provided
    let tenantId = null;
    if (businessEmail && businessEmail.trim()) {
      const tenant = await Tenant.findOne({ email: businessEmail.trim().toLowerCase() }).select('_id status');
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'Business not found. Please check the Business Email entered.' });
      }
      if (tenant.status === 'suspended') {
        return res.status(403).json({ success: false, message: 'This business account has been suspended.' });
      }
      tenantId = tenant._id;
    }

    // Check if user with this phone exists (scoped to tenant if provided)
    const user = await findUserByPhone(phone, tenantId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No active account linked to this phone number. Contact your store administrator.',
      });
    }

    // Generate secure 6-digit OTP and store as bcrypt hash (never plain text in DB)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.otpCode   = await User.hashCode(otpCode);   // hashed
    user.otpExpire = Date.now() + 10 * 60 * 1000;    // 10 minutes valid
    await user.save({ validateBeforeSave: false });

    // Send SMS via Twilio Messages API / Messaging Service
    const client = getTwilioClient();
    const messagePayload = {
      to: normalizedPhone,
      body: `ApexPOS Security Code: ${otpCode}\n\nYour login verification code is ${otpCode}. Valid for 10 minutes.`
    };

    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      messagePayload.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    } else {
      messagePayload.from = process.env.TWILIO_SMS_NUMBER || '+12605975484';
    }

    await client.messages.create(messagePayload);

    console.log(`✅ SMS OTP sent to ${normalizedPhone}`);

    res.json({
      success: true,
      message: `OTP sent via SMS to ${normalizedPhone}. Valid for 10 minutes.`,
      phone: normalizedPhone,
      // Echo tenantId back so verifyOTP can scope correctly without re-resolving
      tenantId: tenantId ? tenantId.toString() : null,
    });
  } catch (error) {
    console.error('SendOTP error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send SMS OTP. Please try again.' });
  }
};

// ─── VERIFY OTP ───────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  if (!isDbConnected())
    return res.status(503).json({ success: false, message: 'Database not available.' });

  try {
    // tenantId is echoed back from sendOTP response and stored by the client
    const { phone, otp, tenantId } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP code are required.' });

    const enteredOTP = otp.toString().trim();

    // Find user by phone, scoped to tenant if tenantId was provided
    // findUserByPhone already selects +otpCode for bcrypt verification
    const user = await findUserByPhone(phone, tenantId || null);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    // Check OTP expiry first (fast check before bcrypt)
    if (!user.otpExpire || user.otpExpire < Date.now()) {
      return res.status(401).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    // Verify entered OTP against the stored bcrypt hash
    const isValidOTP = await User.verifyCode(enteredOTP, user.otpCode);
    if (!isValidOTP) {
      return res.status(401).json({ success: false, message: 'Invalid verification code. Please check and try again.' });
    }

    // OTP matched! Clear OTP fields
    user.otpCode = undefined;
    user.otpExpire = undefined;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Check tenant status
    let plan = 'none';
    if (user.role !== 'superadmin' && user.tenantId) {
      const tenant = await Tenant.findById(user.tenantId).select('plan status');
      if (!tenant || tenant.status === 'suspended') {
        return res.status(403).json({ success: false, message: 'Your business account has been suspended.' });
      }
      plan = tenant?.plan || 'none';
    }

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenantId: user.tenantId,
        plan,
        token: generateToken(user._id, user.tenantId, user.role, user.tokenVersion),
      },
    });
  } catch (error) {
    console.error('VerifyOTP error:', error);
    res.status(500).json({ success: false, message: 'OTP verification failed. Please try again.' });
  }
};

