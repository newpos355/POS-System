const express = require('express');
const router = express.Router();
const c = require('../controllers/customizationController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

// Reads are open to all roles (forms need custom fields, viewers need the
// PDF template); admins/managers shape everything.
const manage = authorize('admin', 'manager');

router.get('/meta', c.getMeta);

// ── PDF templates ────────────────────────────────────────────────────────────
router.get('/pdf-templates/resolve', c.resolvePdfTemplate);
router.route('/pdf-templates')
  .get(c.getPdfTemplates)
  .post(manage, c.createPdfTemplate);
router.route('/pdf-templates/:id')
  .put(validateObjectIdParam('id'), manage, c.updatePdfTemplate)
  .delete(validateObjectIdParam('id'), manage, c.deletePdfTemplate);

// ── Email templates ──────────────────────────────────────────────────────────
router.post('/email-templates/preview', manage, c.previewEmailTemplate);
router.route('/email-templates')
  .get(c.getEmailTemplates)
  .post(manage, c.createEmailTemplate);
router.post('/email-templates/:id/test', validateObjectIdParam('id'), manage, c.testEmailTemplate);
router.route('/email-templates/:id')
  .put(validateObjectIdParam('id'), manage, c.updateEmailTemplate)
  .delete(validateObjectIdParam('id'), manage, c.deleteEmailTemplate);

// ── Custom fields ────────────────────────────────────────────────────────────
router.route('/custom-fields')
  .get(c.getCustomFields)
  .post(manage, c.createCustomField);
router.route('/custom-fields/:id')
  .put(validateObjectIdParam('id'), manage, c.updateCustomField)
  .delete(validateObjectIdParam('id'), manage, c.deleteCustomField);

// ── Custom views ─────────────────────────────────────────────────────────────
router.route('/views')
  .get(c.getCustomViews)
  .post(manage, c.createCustomView);
router.get('/views/:id/data', validateObjectIdParam('id'), c.getCustomViewData);
router.route('/views/:id')
  .put(validateObjectIdParam('id'), manage, c.updateCustomView)
  .delete(validateObjectIdParam('id'), manage, c.deleteCustomView);

module.exports = router;
