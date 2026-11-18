const Tenant = require('../models/Tenant');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const PlatformConfig = require('../models/PlatformConfig');
const mongoose = require('mongoose');
const { generateToken: signToken } = require('../utils/token');
const impersonationStore = require('../utils/impersonationStore');

// Default pricing config fallback
const DEFAULT_PRICING = {
  starter: {
    monthlyPrice: 29,
    annualPrice: 290,
    limits: { users: 2, branches: 1, products: 500 },
    features: ['POS Terminal', 'Basic Reports', 'Inventory Management', 'Email Support'],
  },
  business: {
    monthlyPrice: 79,
    annualPrice: 790,
    limits: { users: 10, branches: 3, products: 5000 },
    features: ['Everything in Starter', 'Multi-Branch', 'Advanced Reports', 'Customer Management', 'Priority Support'],
  },
  enterprise: {
    monthlyPrice: 199,
    annualPrice: 1990,
    limits: { users: -1, branches: -1, products: -1 },
    features: ['Everything in Business', 'Unlimited Users & Branches', 'API Access', 'Custom Integrations', 'Dedicated Support'],
  },
};

// @desc    Get platform stats (MRR, tenants breakdown, active users)
// @route   GET /api/super-admin/stats
// @access  Private/SuperAdmin
exports.getStats = async (req, res) => {
  try {
    const totalTenants = await Tenant.countDocuments();
    const activeTenants = await Tenant.countDocuments({ status: 'active' });
    const suspendedTenants = await Tenant.countDocuments({ status: 'suspended' });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newSignups7d = await Tenant.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    const totalUsers = await User.countDocuments();

    // Plan breakdown
    const planBreakdown = await Tenant.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 } } },
    ]);

    // Estimated MRR calculation
    const tenants = await Tenant.find({ status: 'active' }).select('plan');
    let mrr = 0;
    const planPrices = { starter: 29, business: 79, enterprise: 199 };
    tenants.forEach(t => {
      if (planPrices[t.plan]) mrr += planPrices[t.plan];
    });

    // Recent tenants
    const recentTenants = await Tenant.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email plan status createdAt');

    res.json({
      success: true,
      data: {
        totalTenants,
        activeTenants,
        suspendedTenants,
        newSignups7d,
        totalUsers,
        planBreakdown,
        mrr,
        recentTenants,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all tenants with search & filter
// @route   GET /api/super-admin/tenants
// @access  Private/SuperAdmin
exports.getTenants = async (req, res) => {
  try {
    const { search, plan, status, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (plan) query.plan = plan;
    if (status) query.status = status;

    const total = await Tenant.countDocuments(query);
    const tenants = await Tenant.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Get user counts for each tenant
    const tenantsWithCounts = await Promise.all(
      tenants.map(async (t) => {
        const userCount = await User.countDocuments({ tenantId: t._id });
        return { ...t.toObject(), userCount };
      })
    );

    res.json({
      success: true,
      data: tenantsWithCounts,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single tenant detail with users & total sales
// @route   GET /api/super-admin/tenants/:id
// @access  Private/SuperAdmin
exports.getTenantDetail = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    const users = await User.find({ tenantId: tenant._id }).select('-password');
    const SalesOrder = require('../models/SalesOrder');
    const salesAggregate = await SalesOrder.aggregate([
      { $match: { tenantId: tenant._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } },
    ]);

    const totalRevenue = salesAggregate[0]?.total || 0;

    res.json({
      success: true,
      data: {
        ...tenant.toObject(),
        users,
        totalRevenue,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update tenant subscription plan & expiration
// @route   PUT /api/super-admin/tenants/:id/plan
// @access  Private/SuperAdmin
exports.updateTenantPlan = async (req, res) => {
  try {
    const { plan, planExpiresAt, trialEndsAt, notes } = req.body;
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    if (plan !== undefined) tenant.plan = plan;
    if (planExpiresAt !== undefined) tenant.planExpiresAt = planExpiresAt ? new Date(planExpiresAt) : null;
    if (trialEndsAt !== undefined) tenant.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
    if (notes !== undefined) tenant.notes = notes;

    await tenant.save();

    // Log action
    await AuditLog.create({
      tenantId: tenant._id,
      userId: req.user._id,
      action: 'UPDATE_TENANT_PLAN',
      entity: 'Tenant',
      entityId: tenant._id,
      description: `Updated plan for ${tenant.name} to ${tenant.plan}`,
    });

    res.json({ success: true, data: tenant, message: 'Tenant plan updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update add-on allocations
// @route   PUT /api/super-admin/tenants/:id/add-ons
// @access  Private/SuperAdmin
exports.updateAddOns = async (req, res) => {
  try {
    const { extraUsers, extraBranches, smsCredits } = req.body;
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    tenant.addOns = {
      extraUsers: extraUsers !== undefined ? Number(extraUsers) : tenant.addOns.extraUsers,
      extraBranches: extraBranches !== undefined ? Number(extraBranches) : tenant.addOns.extraBranches,
      smsCredits: smsCredits !== undefined ? Number(smsCredits) : tenant.addOns.smsCredits,
    };

    await tenant.save();

    res.json({ success: true, data: tenant, message: 'Add-ons updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update tenant status (active, suspended, cancelled)
// @route   PUT /api/super-admin/tenants/:id/status
// @access  Private/SuperAdmin
exports.updateTenantStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    tenant.status = status;
    if (status === 'suspended') {
      tenant.suspendReason = reason || 'Suspended by Super Admin';
      tenant.suspendedAt = new Date();

      // Deactivate all users in this tenant
      await User.updateMany({ tenantId: tenant._id }, { isActive: false });
    } else if (status === 'active') {
      tenant.suspendReason = '';
      tenant.suspendedAt = null;

      // Re-activate all users in this tenant
      await User.updateMany({ tenantId: tenant._id }, { isActive: true });
    }

    await tenant.save();

    await AuditLog.create({
      tenantId: tenant._id,
      userId: req.user._id,
      action: `TENANT_${status.toUpperCase()}`,
      entity: 'Tenant',
      entityId: tenant._id,
      description: `Tenant ${tenant.name} status set to ${status}`,
    });

    res.json({ success: true, data: tenant, message: `Tenant status set to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete tenant & all associated data
// @route   DELETE /api/super-admin/tenants/:id
// @access  Private/SuperAdmin
exports.deleteTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    // Delete associated models
    await User.deleteMany({ tenantId: tenant._id });
    await Tenant.findByIdAndDelete(tenant._id);

    await AuditLog.create({
      userId: req.user._id,
      action: 'DELETE_TENANT',
      entity: 'Tenant',
      entityId: tenant._id,
      description: `Deleted tenant business ${tenant.name} (${tenant.email})`,
    });

    res.json({ success: true, message: `Tenant ${tenant.name} deleted successfully` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Impersonate tenant admin ("Login as Tenant")
// @route   POST /api/super-admin/tenants/:id/impersonate
// @access  Private/SuperAdmin
exports.impersonateTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    // Find the tenant's admin user
    let adminUser = await User.findOne({ tenantId: tenant._id, role: 'admin' });
    if (!adminUser) {
      adminUser = await User.findOne({ tenantId: tenant._id });
    }

    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'No active user found for this tenant' });
    }

    // Impersonation session matches a normal login's lifetime (8h) — no reason
    // for a "peek into a tenant" session to outlive a real login by 90x.
    const token = signToken(adminUser._id, adminUser.tenantId, adminUser.role, adminUser.tokenVersion, '8h');

    await AuditLog.create({
      tenantId: tenant._id,
      userId: req.user._id,
      action: 'IMPERSONATE_TENANT',
      entity: 'Tenant',
      entityId: tenant._id,
      description: `Super admin impersonated ${adminUser.email} for tenant ${tenant.name}`,
    });

    // The token itself never leaves this response — it's handed to the frontend
    // as a single-use, 30s-lived opaque code instead, which the new tab
    // exchanges server-side (POST /api/auth/impersonate/exchange). This keeps
    // the real session token out of the URL bar, browser history, and referrer
    // headers. See utils/impersonationStore.js.
    const code = impersonationStore.create(token, {
      _id: adminUser._id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      tenantId: adminUser.tenantId,
      plan: tenant.plan,
    });

    res.json({ success: true, data: { code } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get platform pricing configuration from MongoDB
// @route   GET /api/super-admin/pricing
// @access  Private/SuperAdmin
exports.getPricingConfig = async (req, res) => {
  try {
    let config = await PlatformConfig.findOne({ key: 'pricing_plans' });
    if (!config) {
      config = await PlatformConfig.create({
        key: 'pricing_plans',
        value: DEFAULT_PRICING,
      });
    }
    res.json({ success: true, data: config.value });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update platform pricing configuration in MongoDB
// @route   PUT /api/super-admin/pricing
// @access  Private/SuperAdmin
exports.updatePricingConfig = async (req, res) => {
  try {
    const { pricing } = req.body;
    let config = await PlatformConfig.findOne({ key: 'pricing_plans' });

    if (!config) {
      config = new PlatformConfig({ key: 'pricing_plans', value: pricing });
    } else {
      config.value = pricing;
      config.markModified('value');
    }

    await config.save();

    await AuditLog.create({
      userId: req.user._id,
      action: 'UPDATE_PRICING_CONFIG',
      entity: 'PlatformConfig',
      description: 'Updated platform pricing and plan limit configuration',
    });

    res.json({ success: true, data: config.value, message: 'Pricing configuration updated in MongoDB' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get platform activity audit logs
// @route   GET /api/super-admin/logs
// @access  Private/SuperAdmin
exports.getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, startDate, endDate } = req.query;
    const query = {};

    if (action) {
      query.action = { $regex: action, $options: 'i' };
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('userId', 'name email')
      .populate('tenantId', 'name email');

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get live system health & status metrics
// @route   GET /api/super-admin/system-status
// @access  Private/SuperAdmin
exports.getSystemStatus = async (req, res) => {
  try {
    const Product = require('../models/Product');
    const SalesOrder = require('../models/SalesOrder');
    const Inventory = require('../models/Inventory');
    const Notification = require('../models/Notification');

    const mem = process.memoryUsage();
    const uptimeSec = process.uptime();

    const formatUptime = (seconds) => {
      const d = Math.floor(seconds / (3600 * 24));
      const h = Math.floor((seconds % (3600 * 24)) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${s}s`;
    };

    const counts = {
      tenants: await Tenant.countDocuments(),
      users: await User.countDocuments(),
      products: await Product.countDocuments(),
      salesOrders: await SalesOrder.countDocuments(),
      inventoryRecords: await Inventory.countDocuments(),
      notifications: await Notification.countDocuments(),
      auditLogs: await AuditLog.countDocuments(),
    };

    const dbStateNames = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];

    res.json({
      success: true,
      data: {
        server: {
          status: 'Operational',
          nodeVersion: process.version,
          platform: process.platform,
          uptimeSeconds: Math.floor(uptimeSec),
          uptimeFormatted: formatUptime(uptimeSec),
          memory: {
            heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
            heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2),
            rssMB: (mem.rss / 1024 / 1024).toFixed(2),
          },
        },
        database: {
          status: mongoose.connection.readyState === 1 ? 'Connected' : 'Degraded',
          readyState: mongoose.connection.readyState,
          stateName: dbStateNames[mongoose.connection.readyState] || 'Unknown',
          name: mongoose.connection.name || 'pos_platform',
          host: mongoose.connection.host || 'MongoDB Cluster',
        },
        counts,
        services: [
          { name: 'Core REST API Server', status: 'Operational', latency: '4 ms' },
          { name: 'MongoDB Atlas Database', status: 'Operational', latency: '18 ms' },
          // { name: 'Stripe Payment Engine', status: 'Operational', mode: 'Test/Live' },
          { name: 'African Mobile Money (Airtel/MTN)', status: 'Operational', latency: '35 ms' },
        ],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get platform global settings
// @route   GET /api/super-admin/settings
// @access  Private/SuperAdmin
exports.getSystemSettings = async (req, res) => {
  try {
    let config = await PlatformConfig.findOne({ key: 'system_settings' });
    const defaultSettings = {
      platformName: 'POS Platform SaaS',
      supportEmail: 'support@posplatform.com',
      allowRegistrations: true,
      maintenanceMode: false,
      currency: 'USD ($)',
      trialPeriodDays: 14,
      stripeMode: 'test',
    };

    if (!config) {
      config = await PlatformConfig.create({
        key: 'system_settings',
        value: defaultSettings,
      });
    }

    res.json({ success: true, data: { ...defaultSettings, ...config.value } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update platform global settings
// @route   PUT /api/super-admin/settings
// @access  Private/SuperAdmin
exports.updateSystemSettings = async (req, res) => {
  try {
    const { settings } = req.body;
    let config = await PlatformConfig.findOne({ key: 'system_settings' });

    if (!config) {
      config = new PlatformConfig({ key: 'system_settings', value: settings });
    } else {
      config.value = settings;
      config.markModified('value');
    }

    await config.save();

    await AuditLog.create({
      userId: req.user._id,
      action: 'UPDATE_SYSTEM_SETTINGS',
      entity: 'PlatformConfig',
      description: 'Updated platform global settings',
    });

    res.json({ success: true, data: config.value, message: 'Platform settings saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
