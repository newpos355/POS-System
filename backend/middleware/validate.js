/**
 * Input Validation Middleware — ApexPOS Platform
 *
 * Uses express-validator to validate and sanitise all critical inputs.
 * Each validator returns a standardised 400 error listing all field errors.
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// ── Run validation and return errors if any ───────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please check your input.',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Helper: valid MongoDB ObjectId ────────────────────────────────────────────
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// ── Auth validators ───────────────────────────────────────────────────────────
const validateLogin = [
  body('email')
    .isEmail().withMessage('Valid email address is required.')
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false })
    .isLength({ max: 254 }).withMessage('Email is too long.'),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 1, max: 128 }).withMessage('Password must be between 1 and 128 characters.'),
  body('businessEmail')
    .optional()
    .isEmail().withMessage('Business email must be a valid email address.')
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  validate,
];

const validateRegister = [
  body('businessName')
    .trim()
    .notEmpty().withMessage('Business name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Business name must be 2–100 characters.')
    .escape(),
  body('name')
    .trim()
    .notEmpty().withMessage('Your name is required.')
    .isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters.')
    .escape(),
  body('email')
    .isEmail().withMessage('Valid email address is required.')
    .normalizeEmail()
    .isLength({ max: 254 }),
  body('password')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  validate,
];

const validateForgotPassword = [
  body('email')
    .isEmail().withMessage('Valid email address is required.')
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  validate,
];

const validateResetPassword = [
  body('email').isEmail().normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  body('code')
    .notEmpty().withMessage('Reset code is required.')
    .isLength({ min: 6, max: 6 }).withMessage('Reset code must be exactly 6 digits.')
    .isNumeric().withMessage('Reset code must contain only numbers.'),
  body('newPassword')
    .isLength({ min: 6, max: 128 }).withMessage('New password must be at least 6 characters.'),
  validate,
];

// ── Sale validators ───────────────────────────────────────────────────────────
const validateCreateSale = [
  body('items')
    .isArray({ min: 1 }).withMessage('Sale must have at least one item.'),
  body('items.*.name')
    .trim()
    .notEmpty().withMessage('Item name is required.')
    .isLength({ max: 200 }),
  body('items.*.quantity')
    // Float, not integer: weighed items sell fractional quantities
    // (e.g. 0.735 kg on a scale-integrated line).
    .isFloat({ gt: 0, max: 100000 }).withMessage('Item quantity must be a positive number.'),
  body('items.*.price')
    .isFloat({ min: 0 }).withMessage('Item price must be a non-negative number.'),
  body('grandTotal')
    .isFloat({ min: 0 }).withMessage('Grand total must be a non-negative number.'),
  body('paymentMethod')
    .trim()
    .notEmpty().withMessage('Payment method is required.')
    .isIn(['Cash', 'Card', 'Airtel Money', 'MTN MoMo', 'Credit Sale', 'Pay Later', 'Pesapal', 'Pesapal Uganda', 'Bank Transfer', 'Store Credit', 'Split', 'Other'])
    .withMessage('Invalid payment method.'),
  body('customerId')
    .optional()
    .custom(isObjectId).withMessage('Invalid customer ID format.'),
  validate,
];

// ── Product validators ────────────────────────────────────────────────────────
const validateCreateProduct = [
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required.')
    .isLength({ min: 1, max: 200 }).withMessage('Product name must be 1–200 characters.')
    .escape(),
  body('price')
    .isFloat({ min: 0 }).withMessage('Price must be a non-negative number.'),
  body('stock')
    .optional()
    .isInt({ min: 0 }).withMessage('Stock must be a non-negative integer.'),
  body('sku')
    .optional()
    .trim()
    .isLength({ max: 100 }),
  validate,
];

// ── User validators ───────────────────────────────────────────────────────────
const validateCreateUser = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ min: 2, max: 80 }).escape(),
  body('email')
    .isEmail().withMessage('Valid email is required.')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6, max: 128 }).withMessage('Password must be at least 6 characters.'),
  body('role')
    .isIn(['admin', 'manager', 'cashier']).withMessage('Invalid role. Must be admin, manager, or cashier.'),
  validate,
];

// ── MongoDB ObjectId param validator ─────────────────────────────────────────
const validateObjectIdParam = (paramName = 'id') => [
  param(paramName)
    .custom(isObjectId).withMessage(`Invalid ${paramName} format.`),
  validate,
];

module.exports = {
  validate,
  validateLogin,
  validateRegister,
  validateForgotPassword,
  validateResetPassword,
  validateCreateSale,
  validateCreateProduct,
  validateCreateUser,
  validateObjectIdParam,
};
