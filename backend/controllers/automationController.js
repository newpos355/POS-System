const crypto = require('crypto');
const mongoose = require('mongoose');
const Workflow = require('../models/Workflow');
const Webhook = require('../models/Webhook');
const CustomFunction = require('../models/CustomFunction');
const EmailTemplate = require('../models/EmailTemplate');
const { EVENT_CATALOG, runFunction, computeNextRunAt } = require('../services/automationEngine');
const { dispatch, validateWebhookUrl } = require('../services/webhookDispatcher');

const isDbConnected = () => mongoose.connection.readyState === 1;
const dbGuard = (res) => res.status(503).json({ success: false, message: 'Database not available.' });

// ─── Shared action-list validation ───────────────────────────────────────────
// Normalizes the action array a workflow/function stores. Returns
// {actions} or {error}.
const sanitizeActions = (rawActions) => {
  if (!Array.isArray(rawActions) || rawActions.length === 0) {
    return { error: 'At least one action is required.' };
  }
  if (rawActions.length > 10) return { error: 'A maximum of 10 actions is allowed.' };

  const actions = [];
  for (const a of rawActions) {
    const type = a?.type;
    const cfg = a?.config || {};
    if (type === 'email') {
      const to = cfg.to === 'customer' ? 'customer' : 'custom';
      const recipients = (cfg.recipients || [])
        .map((r) => String(r).trim())
        .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r))
        .slice(0, 10);
      if (to === 'custom' && recipients.length === 0) {
        return { error: 'Email action: add at least one valid recipient (or send to the customer).' };
      }
      if (!cfg.templateId && !(cfg.subject && cfg.body)) {
        return { error: 'Email action: pick a template or write a subject and body.' };
      }
      actions.push({
        type,
        config: {
          to,
          recipients,
          templateId: cfg.templateId && mongoose.Types.ObjectId.isValid(cfg.templateId) ? cfg.templateId : null,
          subject: String(cfg.subject || '').slice(0, 300),
          body: String(cfg.body || '').slice(0, 20000),
        },
      });
    } else if (type === 'webhook') {
      if (!cfg.webhookId || !mongoose.Types.ObjectId.isValid(cfg.webhookId)) {
        return { error: 'Webhook action: select a configured webhook.' };
      }
      actions.push({ type, config: { webhookId: cfg.webhookId } });
    } else if (type === 'notification') {
      if (!String(cfg.title || '').trim()) return { error: 'Notification action: a title is required.' };
      actions.push({
        type,
        config: {
          title: String(cfg.title).slice(0, 200),
          message: String(cfg.message || '').slice(0, 1000),
          priority: ['low', 'medium', 'high', 'critical'].includes(cfg.priority) ? cfg.priority : 'medium',
        },
      });
    } else if (type === 'update_field') {
      const field = String(cfg.field || '');
      if (field !== 'notes' && !/^customFields\.[\w-]+$/.test(field)) {
        return { error: 'Update-field action: only "notes" or a custom field can be updated.' };
      }
      actions.push({ type, config: { field, value: typeof cfg.value === 'string' ? cfg.value.slice(0, 2000) : cfg.value } });
    } else {
      return { error: `Unknown action type "${type}".` };
    }
  }
  return { actions };
};

// ─── META ─────────────────────────────────────────────────────────────────────
// Drives the workflow/function builder UIs: events with their condition and
// placeholder fields, action types, and the tenant's reusable resources
// (email templates + webhooks) for the action dropdowns.
exports.getMeta = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const [templates, hooks] = await Promise.all([
      EmailTemplate.find({ tenantId: req.tenantId, isActive: true }).select('name'),
      Webhook.find({ tenantId: req.tenantId }).select('name url isActive'),
    ]);
    res.json({
      success: true,
      data: {
        events: Object.entries(EVENT_CATALOG).map(([key, e]) => ({
          key, label: e.label, entity: e.entity, fields: e.fields,
        })),
        actionTypes: ['email', 'webhook', 'notification', 'update_field'],
        emailTemplates: templates,
        webhooks: hooks,
        buttonEntities: ['salesOrder', 'customer', 'product'],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══ WORKFLOWS ════════════════════════════════════════════════════════════════

exports.getWorkflows = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const workflows = await Workflow.find({ tenantId: req.tenantId }).sort('-updatedAt');
    res.json({ success: true, data: workflows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const sanitizeConditions = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .filter((c) => c && String(c.field || '').trim())
    .slice(0, 10)
    .map((c) => ({
      field: String(c.field).trim().slice(0, 100),
      operator: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains', 'is_empty', 'not_empty'].includes(c.operator) ? c.operator : 'eq',
      value: typeof c.value === 'string' ? c.value.slice(0, 500) : c.value,
    }));

exports.createWorkflow = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'A workflow name is required.' });
    if (!EVENT_CATALOG[req.body.triggerEvent]) {
      return res.status(400).json({ success: false, message: 'Invalid trigger event.' });
    }
    const { actions, error } = sanitizeActions(req.body.actions);
    if (error) return res.status(400).json({ success: false, message: error });

    const workflow = await Workflow.create({
      tenantId: req.tenantId,
      name,
      description: String(req.body.description || '').trim(),
      triggerEvent: req.body.triggerEvent,
      conditions: sanitizeConditions(req.body.conditions),
      conditionLogic: req.body.conditionLogic === 'or' ? 'or' : 'and',
      actions,
      isActive: req.body.isActive !== false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: workflow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateWorkflow = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.description !== undefined) update.description = String(req.body.description).trim();
    if (req.body.triggerEvent !== undefined) {
      if (!EVENT_CATALOG[req.body.triggerEvent]) {
        return res.status(400).json({ success: false, message: 'Invalid trigger event.' });
      }
      update.triggerEvent = req.body.triggerEvent;
    }
    if (req.body.conditions !== undefined) update.conditions = sanitizeConditions(req.body.conditions);
    if (req.body.conditionLogic !== undefined) update.conditionLogic = req.body.conditionLogic === 'or' ? 'or' : 'and';
    if (req.body.actions !== undefined) {
      const { actions, error } = sanitizeActions(req.body.actions);
      if (error) return res.status(400).json({ success: false, message: error });
      update.actions = actions;
    }
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);

    const workflow = await Workflow.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found.' });
    res.json({ success: true, data: workflow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteWorkflow = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const workflow = await Workflow.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found.' });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══ WEBHOOKS ═════════════════════════════════════════════════════════════════

exports.getWebhooks = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    // Secrets are shown once at creation; list responses omit them.
    const hooks = await Webhook.find({ tenantId: req.tenantId }).select('-secret -deliveries').sort('-updatedAt');
    res.json({ success: true, data: hooks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const sanitizeEvents = (raw) =>
  (Array.isArray(raw) ? raw : []).filter((e) => EVENT_CATALOG[e]);

exports.createWebhook = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const name = String(req.body.name || '').trim();
    const url = String(req.body.url || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'A webhook name is required.' });
    const urlError = validateWebhookUrl(url);
    if (urlError) return res.status(400).json({ success: false, message: urlError });

    const secret = crypto.randomBytes(24).toString('hex');
    const hook = await Webhook.create({
      tenantId: req.tenantId,
      name, url, secret,
      events: sanitizeEvents(req.body.events),
      isActive: req.body.isActive !== false,
      createdBy: req.user._id,
    });
    // The one time the secret is returned — the UI tells the user to copy it.
    const data = hook.toObject();
    delete data.deliveries;
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateWebhook = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.url !== undefined) {
      const urlError = validateWebhookUrl(req.body.url);
      if (urlError) return res.status(400).json({ success: false, message: urlError });
      update.url = String(req.body.url).trim();
    }
    if (req.body.events !== undefined) update.events = sanitizeEvents(req.body.events);
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);

    const hook = await Webhook.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    ).select('-secret -deliveries');
    if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found.' });
    res.json({ success: true, data: hook });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteWebhook = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const hook = await Webhook.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found.' });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getWebhookDeliveries = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const hook = await Webhook.findOne({ _id: req.params.id, tenantId: req.tenantId }).select('name deliveries lastStatus failureCount');
    if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found.' });
    res.json({ success: true, data: hook });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Fire a sample payload at the endpoint so the integration can be verified
// before real events depend on it.
exports.testWebhook = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const hook = await Webhook.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found.' });

    const result = await dispatch(hook, 'test.ping', {
      message: 'ApexPOS webhook test delivery',
      webhookName: hook.name,
    });
    res.json({
      success: result.success,
      message: result.success
        ? `Delivered (HTTP ${result.statusCode}).`
        : `Delivery failed: ${result.error}`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══ CUSTOM FUNCTIONS (buttons & schedulers) ══════════════════════════════════

exports.getFunctions = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const fns = await CustomFunction.find({ tenantId: req.tenantId }).sort('-updatedAt');
    res.json({ success: true, data: fns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Active buttons for one record page (any authenticated role — cashiers see
// sale-page buttons too).
exports.getButtonsForEntity = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const entity = String(req.query.entity || '');
    if (!['salesOrder', 'customer', 'product'].includes(entity)) {
      return res.status(400).json({ success: false, message: 'Invalid entity.' });
    }
    const fns = await CustomFunction.find({
      tenantId: req.tenantId, type: 'button', entity, isActive: true,
    }).select('name description');
    res.json({ success: true, data: fns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const sanitizeSchedule = (raw = {}) => ({
  frequency: ['hourly', 'daily', 'weekly', 'monthly'].includes(raw.frequency) ? raw.frequency : 'daily',
  hour: Math.min(23, Math.max(0, Number(raw.hour) || 0)),
  dayOfWeek: Math.min(6, Math.max(0, Number(raw.dayOfWeek) || 0)),
  dayOfMonth: Math.min(28, Math.max(1, Number(raw.dayOfMonth) || 1)),
});

exports.createFunction = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'A function name is required.' });
    const type = req.body.type === 'scheduler' ? 'scheduler' : 'button';
    const entity = ['salesOrder', 'customer', 'product'].includes(req.body.entity) ? req.body.entity : null;
    if (type === 'button' && !entity) {
      return res.status(400).json({ success: false, message: 'A button needs an entity (which record page shows it).' });
    }
    const { actions, error } = sanitizeActions(req.body.actions);
    if (error) return res.status(400).json({ success: false, message: error });

    const fn = await CustomFunction.create({
      tenantId: req.tenantId,
      name,
      description: String(req.body.description || '').trim(),
      type,
      entity: type === 'button' ? entity : null,
      actions,
      schedule: sanitizeSchedule(req.body.schedule),
      isActive: req.body.isActive !== false,
      createdBy: req.user._id,
    });
    if (type === 'scheduler' && fn.isActive) {
      fn.nextRunAt = computeNextRunAt(fn);
      await fn.save();
    }
    res.status(201).json({ success: true, data: fn });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateFunction = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const existing = await CustomFunction.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!existing) return res.status(404).json({ success: false, message: 'Function not found.' });

    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.description !== undefined) update.description = String(req.body.description).trim();
    if (req.body.type !== undefined) update.type = req.body.type === 'scheduler' ? 'scheduler' : 'button';
    if (req.body.entity !== undefined) {
      update.entity = ['salesOrder', 'customer', 'product'].includes(req.body.entity) ? req.body.entity : null;
    }
    if (req.body.actions !== undefined) {
      const { actions, error } = sanitizeActions(req.body.actions);
      if (error) return res.status(400).json({ success: false, message: error });
      update.actions = actions;
    }
    if (req.body.schedule !== undefined) update.schedule = sanitizeSchedule(req.body.schedule);
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);

    const fn = await CustomFunction.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    );

    // Recompute the next slot whenever schedule/type/active state changed.
    if (fn.type === 'scheduler' && fn.isActive) {
      fn.nextRunAt = computeNextRunAt(fn);
      await fn.save();
    } else if (fn.nextRunAt) {
      fn.nextRunAt = null;
      await fn.save();
    }
    res.json({ success: true, data: fn });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteFunction = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const fn = await CustomFunction.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!fn) return res.status(404).json({ success: false, message: 'Function not found.' });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Run now: a record-page button click (recordId set) or the manager's
// "Run now" on any function.
exports.runFunctionNow = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const fn = await CustomFunction.findOne({ _id: req.params.id, tenantId: req.tenantId, isActive: true });
    if (!fn) return res.status(404).json({ success: false, message: 'Function not found or inactive.' });

    const recordId = req.body.recordId && mongoose.Types.ObjectId.isValid(req.body.recordId)
      ? req.body.recordId : null;
    if (fn.type === 'button' && fn.entity && !recordId) {
      return res.status(400).json({ success: false, message: 'This button runs on a specific record — recordId is required.' });
    }

    const result = await runFunction(fn, recordId);
    res.json({
      success: result.ok,
      message: result.ok
        ? `"${fn.name}" ran successfully.`
        : `Completed with errors: ${result.errors.join(' | ')}`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
