const mongoose = require('mongoose');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { verifyToken } = require('../utils/token');

// ─── PROTECT ──────────────────────────────────────────────────────────────────
// Strictly validates JWT. Rejects invalid/expired/missing tokens with 401.
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized. Please log in.' });
  }

  try {
    // Strictly verify JWT — throws if invalid/expired/tampered
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({ success: false, message: 'Invalid token. Please log in again.' });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Please try again shortly.' });
    }

    // Load real user from DB — must exist and be active
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Account not found. Please log in again.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact your administrator.' });
    }
    // Reject tokens issued before the user's last password change/reset.
    if ((decoded.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Session invalidated. Please log in again.' });
    }

    req.user = user;
    req.tenantId = user.tenantId;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token. Please log in again.' });
    }
    console.error('Protect middleware error:', error);
    return res.status(401).json({ success: false, message: 'Authentication failed.' });
  }
};

// ─── AUTHORIZE ─────────────────────────────────────────────────────────────────
// Role-based access control. Must run after protect().
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized. Please log in.' });
    }

    const userRole = (req.user.role || '').toLowerCase();
    const allowedRoles = roles.map(r => r.toLowerCase());

    if (allowedRoles.length === 0 || allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Access denied. Your role '${req.user.role}' does not have permission for this action.`
    });
  };
};

// ─── OPTIONAL AUTH ──────────────────────────────────────────────────────────────
// Sets req.user and req.tenantId if a valid token is present, but does NOT block if missing.
const optionalAuth = async (req, res, next) => {
  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      const token = req.headers.authorization.split(' ')[1];
      try {
        const decoded = verifyToken(token);
        if (decoded && decoded.id && mongoose.Types.ObjectId.isValid(decoded.id) && mongoose.connection.readyState === 1) {
          const user = await User.findById(decoded.id).select('-password');
          if (user && user.isActive && (decoded.tv || 0) === (user.tokenVersion || 0)) {
            req.user = user;
            req.tenantId = user.tenantId;
          }
        }
      } catch (e) {
        // Invalid token in optional routes — just proceed without user context
      }
    }
    next();
  } catch (err) {
    next();
  }
};

module.exports = { protect, authorize, optionalAuth };
