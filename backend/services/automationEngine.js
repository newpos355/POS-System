const mongoose = require('mongoose');
const Workflow = require('../models/Workflow');
const Webhook = require('../models/Webhook');
const EmailTemplate = require('../models/EmailTemplate');
const CustomFunction = require('../models/CustomFunction');
const Tenant = require('../models/Tenant');
const { createNotification } = require('../controllers/notificationController');
const { render, buildContext } = require('./templateRenderer');
const { dispatch } = require('./webhookDispatcher');
const { sendMail } = require('../utils/email');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── Event catalog ───────────────────────────────────────────────────────────
// Every automation event, the context fields it exposes (used by the UI to
// offer condition fields and {{placeholders}}), and which record
// update_field actions may touch. Controllers emit these via emitEvent.
const EVENT_CATALOG = {
  'sale.created': {
    label: 'Sale completed',
    entity: 'salesOrder',
    fields: ['order.number', 'order.total', 'order.subtotal', 'order.discount', 'order.tax',
      'order.paymentMethod', 'order.paymentStatus', 'order.itemCount', 'order.balanceDue',
      'customer.name', 'customer.email', 'customer.phone', 'cashier.name', 'items_table'],
  },
  'sale.voided': {
    label: 'Sale voided',
    entity: 'salesOrder',
    fields: ['order.number', 'order.total', 'order.paymentMethod', 'customer.name', 'customer.email'],
  },
  'sale.payment_received': {
    label: 'Payment received (due bill)',
    entity: 'salesOrder',
    fields: ['order.number', 'order.total', 'order.balanceDue', 'payment.amount', 'payment.method',
      'customer.name', 'customer.email'],
  },
  'customer.created': {
    label: 'Customer created',
    entity: 'customer',
    fields: ['customer.name', 'customer.email', 'customer.phone', 'customer.address'],
  },
  'product.created': {
    label: 'Product created',
    entity: 'product',
    fields: ['product.name', 'product.sku', 'product.price', 'product.stock'],
  },
  'purchase.created': {
    label: 'Purchase order created',
    entity: null,
    fields: ['purchase.number', 'purchase.total', 'purchase.status', 'purchase.vendorName'],
  },
  'return.created': {
    label: 'Return processed',
    entity: null,
    fields: ['return.number', 'return.total', 'return.reason', 'customer.name'],
  },
  'inventory.low_stock': {
    label: 'Stock below reorder level',
    entity: 'product',
    fields: ['product.name', 'product.sku', 'product.stock', 'product.reorderLevel'],
  },
};

// Models update_field actions may write to, keyed by catalog entity.
const ENTITY_MODELS = {
  salesOrder: () => require('../models/SalesOrder'),
  customer: () => require('../models/Customer'),
  product: () => require('../models/Product'),
};

// ─── Condition evaluation ────────────────────────────────────────────────────
const getPath = (obj, path) =>
  String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const evalCondition = (cond, context) => {
  const actual = getPath(context, cond.field);
  const expected = cond.value;

  switch (cond.operator) {
    case 'is_empty': return actual === undefined || actual === null || actual === '';
    case 'not_empty': return !(actual === undefined || actual === null || actual === '');
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'not_contains':
      return !String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    default: {
      // Numeric compare when both sides are numeric, string compare otherwise.
      const aNum = Number(actual);
      const eNum = Number(expected);
      const numeric = actual !== '' && expected !== '' && Number.isFinite(aNum) && Number.isFinite(eNum);
      const a = numeric ? aNum : String(actual ?? '').toLowerCase();
      const e = numeric ? eNum : String(expected ?? '').toLowerCase();
      if (cond.operator === 'eq') return a === e;
      if (cond.operator === 'neq') return a !== e;
      if (cond.operator === 'gt') return a > e;
      if (cond.operator === 'gte') return a >= e;
      if (cond.operator === 'lt') return a < e;
      if (cond.operator === 'lte') return a <= e;
      return false;
    }
  }
};

const conditionsMatch = (workflow, context) => {
  const conds = workflow.conditions || [];
  if (conds.length === 0) return true;
  return workflow.conditionLogic === 'or'
    ? conds.some((c) => evalCondition(c, context))
    : conds.every((c) => evalCondition(c, context));
};

// ─── Action execution ────────────────────────────────────────────────────────
// Runs each action in order, isolating failures so one dead email server
// doesn't stop the webhook after it. Returns {ok, partial, errors[]}.
// `meta` = {tenantId, event, entity, entityId} — entity/entityId power
// update_field.
const executeActions = async (actions, context, meta) => {
  const errors = [];

  for (const action of actions || []) {
    try {
      const cfg = action.config || {};

      if (action.type === 'email') {
        let subject = cfg.subject || '';
        let body = cfg.body || '';
        if (cfg.templateId) {
          const tpl = await EmailTemplate.findOne({ _id: cfg.templateId, tenantId: meta.tenantId });
          if (!tpl) throw new Error('Email template not found.');
          subject = tpl.subject;
          body = tpl.bodyHtml;
        }
        const recipients = cfg.to === 'customer'
          ? [context.customer?.email].filter(Boolean)
          : (cfg.recipients || []).filter(Boolean);
        if (!recipients.length) throw new Error(cfg.to === 'customer'
          ? 'Customer has no email address.'
          : 'No recipients configured.');
        await sendMail(recipients, render(subject, context, { html: false }), render(body, context));

      } else if (action.type === 'webhook') {
        if (!cfg.webhookId) throw new Error('No webhook selected.');
        const hook = await Webhook.findOne({ _id: cfg.webhookId, tenantId: meta.tenantId, isActive: true });
        if (!hook) throw new Error('Webhook not found or inactive.');
        const result = await dispatch(hook, meta.event, context);
        if (!result.success) throw new Error(result.error || 'Delivery failed.');

      } else if (action.type === 'notification') {
        await createNotification({
          tenantId: meta.tenantId,
          type: 'system',
          priority: ['low', 'medium', 'high', 'critical'].includes(cfg.priority) ? cfg.priority : 'medium',
          title: render(cfg.title || 'Automation', context, { html: false }) || 'Automation',
          message: render(cfg.message || '', context, { html: false }) || meta.event,
        });

      } else if (action.type === 'update_field') {
        const field = String(cfg.field || '');
        // Whitelist: automations may annotate records, never mutate money,
        // stock or status fields.
        if (field !== 'notes' && !/^customFields\.[\w-]+$/.test(field)) {
          throw new Error(`Field "${field}" cannot be updated by automations (allowed: notes, customFields.*).`);
        }
        const getModel = ENTITY_MODELS[meta.entity];
        if (!getModel || !meta.entityId) throw new Error('This event has no updatable record.');
        const value = typeof cfg.value === 'string' ? render(cfg.value, context, { html: false }) : cfg.value;
        const Model = getModel();
        await Model.updateOne(
          { _id: meta.entityId, tenantId: meta.tenantId },
          { $set: { [field]: value } }
        );
      }
    } catch (err) {
      errors.push(`${action.type}: ${err.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    partial: errors.length > 0 && errors.length < (actions || []).length,
    errors,
  };
};

// ─── Emit an event (public API for controllers) ──────────────────────────────
// Fire-and-forget: scheduled on the next tick so checkout latency never
// waits on emails or webhooks, and any engine error only logs.
const emitEvent = (tenantId, event, data) => {
  if (!EVENT_CATALOG[event]) {
    console.error(`[AUTOMATION] Unknown event emitted: ${event}`);
    return;
  }
  setImmediate(() => {
    handleEvent(tenantId, event, data).catch((err) =>
      console.error(`[AUTOMATION] ${event} handling error:`, err.message)
    );
  });
};

const handleEvent = async (tenantId, event, data = {}) => {
  if (!isDbConnected()) return;

  const [tenant, workflows, hooks] = await Promise.all([
    Tenant.findById(tenantId).select('name email phone'),
    Workflow.find({ tenantId, triggerEvent: event, isActive: true }),
    Webhook.find({ tenantId, isActive: true, events: event }),
  ]);
  if (!workflows.length && !hooks.length) return;

  // Sale events often carry a customerId that is unpopulated (or populated
  // without email) — actions that email the customer need the address, so
  // fetch it here, only once someone is actually listening.
  if (data.sale && !data.customer && data.sale.customerId) {
    const ref = data.sale.customerId;
    const id = typeof ref === 'object' ? ref._id : ref;
    if (id && (typeof ref !== 'object' || ref.email === undefined)) {
      const Customer = require('../models/Customer');
      data.customer = await Customer.findOne({ _id: id, tenantId })
        .select('name email phone address outstandingCredit').lean();
    }
  }

  const context = buildContext(event, data, tenant);
  const entity = EVENT_CATALOG[event].entity;
  const entityId = data.sale?._id || data.customer?._id || data.product?._id || null;

  // Directly subscribed webhooks fire for every occurrence, unconditionally.
  for (const hook of hooks) {
    await dispatch(hook, event, context);
  }

  for (const wf of workflows) {
    if (!conditionsMatch(wf, context)) continue;
    const result = await executeActions(wf.actions, context, { tenantId, event, entity, entityId });
    await Workflow.updateOne(
      { _id: wf._id },
      {
        $inc: { runCount: 1 },
        $set: {
          lastRunAt: new Date(),
          lastStatus: result.ok ? 'ok' : (result.partial ? 'partial' : 'failed'),
          lastError: result.errors.join(' | ') || null,
        },
      }
    );
    if (result.errors.length) {
      console.error(`[AUTOMATION] Workflow "${wf.name}": ${result.errors.join(' | ')}`);
    }
  }
};

// ─── Custom functions ────────────────────────────────────────────────────────
// Buttons run against a record's context; schedulers run on a business-level
// context. Both reuse executeActions above.
const buildRecordContext = async (fn, recordId, tenant) => {
  if (fn.entity === 'salesOrder') {
    const SalesOrder = require('../models/SalesOrder');
    const sale = await SalesOrder.findOne({ _id: recordId, tenantId: fn.tenantId })
      .populate('customerId', 'name email phone')
      .populate('cashierId', 'name');
    if (!sale) throw new Error('Sale not found.');
    return { context: buildContext('sale.created', { sale }, tenant), entityId: sale._id };
  }
  if (fn.entity === 'customer') {
    const Customer = require('../models/Customer');
    const customer = await Customer.findOne({ _id: recordId, tenantId: fn.tenantId });
    if (!customer) throw new Error('Customer not found.');
    return { context: buildContext('customer.created', { customer }, tenant), entityId: customer._id };
  }
  if (fn.entity === 'product') {
    const Product = require('../models/Product');
    const product = await Product.findOne({ _id: recordId, tenantId: fn.tenantId });
    if (!product) throw new Error('Product not found.');
    return { context: buildContext('product.created', { product }, tenant), entityId: product._id };
  }
  return { context: buildContext('manual', {}, tenant), entityId: null };
};

// Run a function now (button click, "Run now", or scheduler tick).
const runFunction = async (fn, recordId = null) => {
  const tenant = await Tenant.findById(fn.tenantId).select('name email phone');

  let context;
  let entityId = null;
  if (fn.type === 'button' && fn.entity && recordId) {
    ({ context, entityId } = await buildRecordContext(fn, recordId, tenant));
  } else {
    context = buildContext('manual', {}, tenant);
  }

  const result = await executeActions(fn.actions, context, {
    tenantId: fn.tenantId,
    event: `function.${fn.name}`,
    entity: fn.entity,
    entityId,
  });

  await CustomFunction.updateOne(
    { _id: fn._id },
    {
      $inc: { runCount: 1 },
      $set: {
        lastRunAt: new Date(),
        lastStatus: result.ok ? 'ok' : (result.partial ? 'partial' : 'failed'),
        lastError: result.errors.join(' | ') || null,
      },
    }
  );
  return result;
};

// ─── Scheduler for type:'scheduler' functions ────────────────────────────────
// Same claim pattern as reportRunner: a conditional update on nextRunAt so
// two server instances never double-run a slot.
const computeNextRunAt = (fn, from = new Date()) => {
  const s = fn.schedule || {};
  const next = new Date(from);
  next.setMinutes(0, 0, 0);

  if (s.frequency === 'hourly') {
    next.setHours(next.getHours() + 1);
    return next;
  }
  next.setHours(s.hour ?? 7);
  if (s.frequency === 'weekly') {
    const target = s.dayOfWeek ?? 1;
    while (next.getDay() !== target || next <= from) next.setDate(next.getDate() + 1);
  } else if (s.frequency === 'monthly') {
    const target = s.dayOfMonth ?? 1;
    next.setDate(target);
    if (next <= from) next.setMonth(next.getMonth() + 1, target);
  } else { // daily
    if (next <= from) next.setDate(next.getDate() + 1);
  }
  return next;
};

const TICK_MS = 60 * 1000;

async function tick() {
  if (!isDbConnected()) return;
  try {
    const now = new Date();
    const due = await CustomFunction.find({
      isActive: true,
      type: 'scheduler',
      nextRunAt: { $lte: now },
    }).limit(20);

    for (const fn of due) {
      const claimed = await CustomFunction.findOneAndUpdate(
        { _id: fn._id, isActive: true, nextRunAt: fn.nextRunAt },
        { $set: { nextRunAt: computeNextRunAt(fn, now) } },
        { new: false }
      );
      if (!claimed) continue; // another instance took it

      try {
        const result = await runFunction(fn);
        console.log(`[AUTOMATION] Scheduled function "${fn.name}": ${result.ok ? 'ok' : result.errors.join(' | ')}`);
      } catch (err) {
        console.error(`[AUTOMATION] Scheduled function "${fn.name}" failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[AUTOMATION] scheduler tick error:', err.message);
  }
}

function startFunctionScheduler() {
  setInterval(tick, TICK_MS);
  setTimeout(tick, 45 * 1000);
  console.log('⚡ Automation function scheduler active (1-minute tick)');
}

module.exports = {
  EVENT_CATALOG,
  emitEvent,
  executeActions,
  runFunction,
  computeNextRunAt,
  startFunctionScheduler,
};
