const express = require('express');
const router = express.Router();
const c = require('../controllers/automationController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

const manage = authorize('admin', 'manager');

router.get('/meta', manage, c.getMeta);

// ── Workflows (rules, email alerts) ──────────────────────────────────────────
router.route('/workflows')
  .get(manage, c.getWorkflows)
  .post(manage, c.createWorkflow);
router.route('/workflows/:id')
  .put(validateObjectIdParam('id'), manage, c.updateWorkflow)
  .delete(validateObjectIdParam('id'), manage, c.deleteWorkflow);

// ── Webhooks ─────────────────────────────────────────────────────────────────
router.route('/webhooks')
  .get(manage, c.getWebhooks)
  .post(manage, c.createWebhook);
router.get('/webhooks/:id/deliveries', validateObjectIdParam('id'), manage, c.getWebhookDeliveries);
router.post('/webhooks/:id/test', validateObjectIdParam('id'), manage, c.testWebhook);
router.route('/webhooks/:id')
  .put(validateObjectIdParam('id'), manage, c.updateWebhook)
  .delete(validateObjectIdParam('id'), manage, c.deleteWebhook);

// ── Custom functions (buttons & schedulers) ──────────────────────────────────
// Buttons are visible and runnable by any authenticated role (cashiers use
// them on the sale page); managing them is admin/manager.
router.get('/functions/buttons', c.getButtonsForEntity);
router.route('/functions')
  .get(manage, c.getFunctions)
  .post(manage, c.createFunction);
router.post('/functions/:id/run', validateObjectIdParam('id'), c.runFunctionNow);
router.route('/functions/:id')
  .put(validateObjectIdParam('id'), manage, c.updateFunction)
  .delete(validateObjectIdParam('id'), manage, c.deleteFunction);

module.exports = router;
