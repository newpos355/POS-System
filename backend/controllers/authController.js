const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Branch = require('../models/Branch');
const { sendPasswordResetEmail } = require('../utils/email');
const { generateToken: signToken } = require('../utils/token');
const impersonationStore = require('../utils/impersonationStore');

// 8h for all users — short enough to be secure, long enough for a full work shift.
// Admins get a longer inactivity window on the frontend (see useSessionTimeout hook).
const generateToken = (id, tenantId, role, tokenVersion = 0) =>
  signToken(id, tenantId, role, tokenVersion, '8h');

const isDbConnected = () => mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2;

// Shared strength policy — used for both registration and password reset so
// a compromised reset flow can't be used to downgrade an account to a weak password.
const validatePasswordStrength = (password) => {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  return { valid: true };
};

const validateStrictEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Email address is required.' };
  }

  const trimmed = email.trim().toLowerCase();

  // 1. Strict RFC 5322 regex (username @ domain . tld)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,15}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, message: 'Please enter a valid email address with domain (e.g. name@company.com).' };
  }

  const [localPart, domain] = trimmed.split('@');
  const domainParts = domain.split('.');
  const domainName = domainParts[0];

  // 2. Block placeholder/fake usernames and domain matching test strings
  if (localPart === domainName) {
    return { valid: false, message: 'Fake or placeholder email addresses are not allowed.' };
  }

  if (localPart.length < 2) {
    return { valid: false, message: 'Please enter a valid email username.' };
  }

  // 3. Block temporary, disposable and fake email domains
  const blockedDomains = [
    'test.com', 'example.com', 'fake.com', 'mailinator.com', 'tempmail.com',
    '10minutemail.com', 'trashmail.com', 'yopmail.com', 'dispostable.com',
    'guerrillamail.com', 'sharklasers.com', 'getnada.com', 'binkmail.com',
    'throwawaymail.com', 'temp-mail.org', 'fakeinbox.com', 'abc.com', 'xyz.com', 'asdf.com'
  ];

  if (blockedDomains.includes(domain)) {
    return { valid: false, message: 'Disposable or fake test email domains are not allowed. Please use a real email address.' };
  }

  return { valid: true };
};

// ─── REGISTER ──────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available. Please try again shortly.' });
  }

  try {
    const { businessName, name, email, password, phone } = req.body;

    if (!businessName || !name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
    }

    // Strict Email Format Validation
    const emailCheck = validateStrictEmail(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ success: false, message: emailCheck.message });
    }

    // Strict Password Strength Validation
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    // Normalize phone number if provided
    let normalizedPhone = undefined;
    if (phone && phone.trim()) {
      let p = phone.trim().replace(/\s+/g, '').replace(/-/g, '');
      if (!p.startsWith('+')) p = '+' + p;
      if (/^\+\d{7,15}$/.test(p)) {
        normalizedPhone = p;
      }
    }

    // Check if business email already registered
    const tenantExists = await Tenant.findOne({ email: email.trim().toLowerCase() });
    if (tenantExists) {
      return res.status(400).json({ success: false, message: 'A business with this email already exists.' });
    }

    // 1. Create Tenant (the business account)
    const tenant = await Tenant.create({
      name: businessName.trim(),
      email: email.trim().toLowerCase(),
      phone: normalizedPhone || '',
    });

    // 2. Create the Admin user for this tenant
    const user = await User.create({
      tenantId: tenant._id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'admin',
      phone: normalizedPhone,
    });

    // 3. Auto-create the default Main Branch for this tenant
    await Branch.create({
      tenantId: tenant._id,
      name: 'Main Branch',
      address: 'Main Location',
      phone: normalizedPhone || '',
      isDefault: true,
    }).catch(() => {});

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        plan: tenant.plan || 'none',
        token: generateToken(user._id, user.tenantId, user.role, user.tokenVersion),
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already in use.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── LOGIN ─────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available. Please try again shortly.' });
  }

  try {
    const { email, password, businessEmail } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    let matchedUser = null;
    let tenant = null;

    // ── Tenant-scoped login (cashiers / managers) ─────────────────────────────
    // When a businessEmail is provided, we look up the Tenant by that email first,
    // then scope the user lookup strictly to that tenant.
    // This prevents agaba@gmail.com from Tenant A ever matching agaba@gmail.com
    // from Tenant B — even if they share the same password.
    if (businessEmail && businessEmail.trim()) {
      const normalizedBusinessEmail = businessEmail.trim().toLowerCase();

      // Find the tenant whose admin registered with this email
      tenant = await Tenant.findOne({ email: normalizedBusinessEmail }).select('plan status name');
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'Business not found. Please check the Business Email entered.',
        });
      }
      if (tenant.status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'This business account has been suspended. Contact platform support.',
        });
      }

      // Find the user ONLY within this tenant
      const user = await User.findOne({
        email: normalizedEmail,
        tenantId: tenant._id,
      }).select('+password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'No account with this email exists under the specified business.',
        });
      }

      // Verify password
      const isMatch = (await user.matchPassword(cleanPassword)) ||
        (cleanPassword !== password && (await user.matchPassword(password)));
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Your account has been deactivated. Contact your store administrator.',
        });
      }

      matchedUser = user;
    } else {
      // ── Admin / superadmin login (no businessEmail needed) ──────────────────
      // Admins registered the business themselves, so their email IS unique per
      // tenant. We search across tenants but only return if exactly one matches.
      const users = await User.find({ email: normalizedEmail }).select('+password');

      if (!users || users.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      for (const u of users) {
        const isMatch = (await u.matchPassword(cleanPassword)) ||
          (cleanPassword !== password && (await u.matchPassword(password)));
        if (isMatch) {
          matchedUser = u;
          break;
        }
      }

      if (!matchedUser) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      if (!matchedUser.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Your account has been deactivated. Please contact your store administrator.',
        });
      }
    }

    // ── Common post-auth checks ───────────────────────────────────────────────
    if (matchedUser.role !== 'superadmin' && matchedUser.tenantId) {
      // Load tenant if not already loaded (admin path)
      if (!tenant) {
        tenant = await Tenant.findById(matchedUser.tenantId).select('plan status');
      }
      if (!tenant) {
        return res.status(401).json({ success: false, message: 'Business account not found. Please contact support.' });
      }
      if (tenant.status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'Your business account has been suspended. Please contact platform support.',
        });
      }

      await User.updateOne({ _id: matchedUser._id }, { $set: { lastLogin: new Date() } });

      return res.json({
        success: true,
        data: {
          _id: matchedUser._id,
          name: matchedUser.name,
          email: matchedUser.email,
          role: matchedUser.role,
          tenantId: matchedUser.tenantId,
          plan: tenant?.plan || 'none',
          token: generateToken(matchedUser._id, matchedUser.tenantId, matchedUser.role, matchedUser.tokenVersion),
        },
      });
    }

    // Superadmin path
    matchedUser.lastLogin = Date.now();
    await matchedUser.save({ validateBeforeSave: false });

    return res.json({
      success: true,
      data: {
        _id: matchedUser._id,
        name: matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role,
        tenantId: matchedUser.tenantId,
        plan: 'enterprise',
        token: generateToken(matchedUser._id, matchedUser.tenantId, matchedUser.role),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET ME ─────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available.' });
    }

    const user = await User.findById(req.user.id || req.user._id).select('-password').populate('branchId', 'name');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const tenant = await Tenant.findById(user.tenantId).select('plan planExpiresAt');
    const userData = user.toObject();
    userData.plan = tenant?.plan || 'none';
    userData.planExpiresAt = tenant?.planExpiresAt;

    res.json({ success: true, data: userData });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE PROFILE ─────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available.' });
    }

    const user = await User.findById(req.user.id || req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.name = req.body.name || user.name;
    user.phone = req.body.phone || user.phone;
    if (req.body.avatar) user.avatar = req.body.avatar;

    const updatedUser = await user.save();
    res.json({ success: true, data: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CHANGE PASSWORD ─────────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available.' });
    }

    const user = await User.findById(req.user.id || req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await user.matchPassword(req.body.oldPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Old password is incorrect.' });
    }

    const pwCheck = validatePasswordStrength(req.body.newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    user.password = req.body.newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidate every previously issued token
    await user.save();

    // Re-issue a fresh token for the current session under the new version
    // so the user isn't immediately logged out by their own password change.
    const token = generateToken(user._id, user.tenantId, user.role, user.tokenVersion);
    res.json({ success: true, data: { message: 'Password updated successfully.', token } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── FORGOT PASSWORD ────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const emailCheck = validateStrictEmail(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ success: false, message: emailCheck.message });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({
      $or: [
        { email: cleanEmail },
        { email: { $regex: `^${cleanEmail}$`, $options: 'i' } }
      ]
    });
    console.log(`[FORGOT PASSWORD] Requested email: "${cleanEmail}" -> Found user in DB:`, user ? `YES (${user.email})` : '❌ NOT FOUND IN DATABASE');

    if (user) {
      // Generate 6-digit reset code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      user.resetPasswordToken = await User.hashCode(resetCode);
      user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 mins
      await user.save({ validateBeforeSave: false });

      // Send reset code email
      try {
        await sendPasswordResetEmail(user.email, resetCode, user.name);
      } catch (mailErr) {
        console.error('[EMAIL ERROR] Failed to send email via SMTP:', mailErr);
        return res.status(500).json({
          success: false,
          message: `Failed to send reset email: ${mailErr.message || 'SMTP Error'}`
        });
      }
    }

    return res.json({
      success: true,
      message: 'If an account with this email exists, a reset code has been sent to your inbox.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ─── RESET PASSWORD ─────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { email, code, resetToken, newPassword } = req.body;
    const plainCode = (code || resetToken || '').trim();

    if (!email || !plainCode || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, reset code, and new password are required.' });
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    // Find user by email with a non-expired token — NOT by the token itself
    // (token is stored as a hash so we cannot query by it directly)
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+password +resetPasswordToken');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset code. Please request a new one.' });
    }

    // Verify entered code against the stored bcrypt hash
    const isValid = await User.verifyCode(plainCode, user.resetPasswordToken);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid reset code. Please check and try again.' });
    }

    // Code matched — update password and clear reset fields
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidate any token issued before this reset
    await user.save();

    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── EXCHANGE IMPERSONATION CODE ─────────────────────────────────────────────
// Public (unauthenticated by design — the new tab has no session yet). Trades a
// single-use, 30s-lived opaque code for the real session token + user payload.
// See utils/impersonationStore.js and superAdminController.impersonateTenant.
exports.exchangeImpersonationCode = (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, message: 'Impersonation code is required.' });
  }

  const result = impersonationStore.consume(code);
  if (!result) {
    return res.status(400).json({ success: false, message: 'Invalid or expired impersonation link. Please try again from the super admin panel.' });
  }

  res.json({ success: true, data: result });
};

