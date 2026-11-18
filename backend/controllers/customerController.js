const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const SalesOrder = require('../models/SalesOrder');
const { emitEvent } = require('../services/automationEngine');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── GET CUSTOMERS (with live order stats) ─────────────────────────────────────
exports.getCustomers = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip  = (page - 1) * limit;

    const matchStage = { tenantId: req.tenantId };
    if (req.query.search) {
      matchStage.$or = [
        { name:  { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { phone: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [total, customers] = await Promise.all([
      Customer.countDocuments(matchStage),

      // ── Aggregation: join SalesOrders to compute live stats ──────────────
      Customer.aggregate([
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        { $skip:  skip },
        { $limit: limit },

        // Join completed, non-voided sales — match by customerId (ObjectId) OR customerName (string)
        {
          $lookup: {
            from:     'salesorders',
            let:      { cid: '$_id', tid: '$tenantId', cname: '$name' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$tenantId', '$$tid'] },
                      { $ne: ['$status', 'voided'] },
                      {
                        $or: [
                          // Match by linked ObjectId (when customer was selected from dropdown)
                          { $eq: ['$customerId', '$$cid'] },
                          // Match by name string (credit sales or walk-in with name typed)
                          { $eq: [{ $toLower: '$customerName' }, { $toLower: '$$cname' }] },
                        ],
                      },
                    ],
                  },
                },
              },
              { $project: { grandTotal: 1, _id: 0 } },
            ],
            as: '_orders',
          },
        },

        // Add computed fields
        {
          $addFields: {
            totalOrders:    { $size: '$_orders' },
            totalSpent:     { $sum: '$_orders.grandTotal' },
            totalPurchases: { $size: '$_orders' },
          },
        },

        // Remove raw join array from response
        { $project: { _orders: 0 } },
      ]),
    ]);


    res.json({
      success: true,
      data: customers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET CUSTOMER ─────────────────────────────────────────────────────────────
exports.getCustomer = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const customer = await Customer.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE CUSTOMER ───────────────────────────────────────────────────────────
exports.createCustomer = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { name, email, phone } = req.body;
    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name, Phone Number, and Email Address are all mandatory fields.'
      });
    }

    // Check for duplicate email within tenant
    if (email) {
      const existing = await Customer.findOne({ email: email.trim(), tenantId: req.tenantId });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A customer with this email already exists.' });
      }
    }

    const customer = await Customer.create({ ...req.body, tenantId: req.tenantId });

    // Automation: workflow rules & webhooks subscribed to new customers.
    emitEvent(req.tenantId, 'customer.created', { customer });

    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE CUSTOMER ───────────────────────────────────────────────────────────
exports.updateCustomer = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    // Strip tenantId/_id out of the body — the query already pins tenantId,
    // but merging req.body straight into the update let a caller reassign
    // their own record's tenantId field and move it to another tenant.
    const { tenantId, _id, ...safeBody } = req.body;
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      safeBody,
      { new: true, runValidators: true }
    );
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE CUSTOMER ───────────────────────────────────────────────────────────
exports.deleteCustomer = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    await Customer.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── BLOCK / UNBLOCK CREDIT ────────────────────────────────────────────────────
exports.setCreditBlock = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { blocked } = req.body; // true | false
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { creditBlocked: !!blocked },
      { new: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, data: customer, message: blocked ? 'Credit sales blocked for this customer.' : 'Credit sales unblocked.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── SETTLE CREDIT ─────────────────────────────────────────────────────────────
exports.settleCredit = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { outstandingCredit: 0 },
      { new: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, data: customer, message: 'Outstanding credit settled and cleared.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
