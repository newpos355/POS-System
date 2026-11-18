const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getStats,
  getTenants,
  getTenantDetail,
  updateTenantPlan,
  updateAddOns,
  updateTenantStatus,
  deleteTenant,
  impersonateTenant,
  getPricingConfig,
  updatePricingConfig,
  getActivityLogs,
  getSystemStatus,
  getSystemSettings,
  updateSystemSettings,
} = require('../controllers/superAdminController');

// All routes require authentication & superadmin role
router.use(protect);
router.use(authorize('superadmin'));

router.get('/stats', getStats);

router.get('/tenants', getTenants);
router.get('/tenants/:id', getTenantDetail);
router.put('/tenants/:id/plan', updateTenantPlan);
router.put('/tenants/:id/add-ons', updateAddOns);
router.put('/tenants/:id/status', updateTenantStatus);
router.delete('/tenants/:id', deleteTenant);
router.post('/tenants/:id/impersonate', impersonateTenant);

router.get('/pricing', getPricingConfig);
router.put('/pricing', updatePricingConfig);

router.get('/logs', getActivityLogs);

router.get('/system-status', getSystemStatus);
router.get('/settings', getSystemSettings);
router.put('/settings', updateSystemSettings);

module.exports = router;
