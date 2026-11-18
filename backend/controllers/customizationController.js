const mongoose = require('mongoose');
const PdfTemplate = require('../models/PdfTemplate');
const EmailTemplate = require('../models/EmailTemplate');
const CustomField = require('../models/CustomField');
const CustomView = require('../models/CustomView');
const { render, buildContext } = require('../services/templateRenderer');
const { sendMail } = require('../utils/email');

const isDbConnected = () => mongoose.connection.readyState === 1;
const dbGuard = (res) => res.status(503).json({ success: false, message: 'Database not available.' });

// ─── Custom-view field catalog ───────────────────────────────────────────────
// The only fields a saved view may filter, sort or display, per entity.
// Everything the client sends is checked against this — filters can never
// smuggle raw Mongo operators or reach un-catalogued fields.
const VIEW_CATALOG = {
  sales: {
    model: () => require('../models/SalesOrder'),
    label: 'Sales Orders',
    fields: {
      orderNumber: { label: 'Order #', type: 'text' },
      customerName: { label: 'Customer', type: 'text' },
      paymentMethod: { label: 'Payment Method', type: 'text' },
      paymentStatus: { label: 'Payment Status', type: 'text' },
      status: { label: 'Status', type: 'text' },
      subtotal: { label: 'Subtotal', type: 'number' },
      totalDiscount: { label: 'Discount', type: 'number' },
      totalTax: { label: 'Tax', type: 'number' },
      grandTotal: { label: 'Grand Total', type: 'number' },
      createdAt: { label: 'Date', type: 'date' },
    },
  },
  products: {
    model: () => require('../models/Product'),
    label: 'Products',
    fields: {
      name: { label: 'Name', type: 'text' },
      sku: { label: 'SKU', type: 'text' },
      barcode: { label: 'Barcode', type: 'text' },
      price: { label: 'Price', type: 'number' },
      costPrice: { label: 'Cost Price', type: 'number' },
      stock: { label: 'Stock', type: 'number' },
      reorderLevel: { label: 'Reorder Level', type: 'number' },
      status: { label: 'Status', type: 'text' },
      createdAt: { label: 'Created', type: 'date' },
    },
  },
  customers: {
    model: () => require('../models/Customer'),
    label: 'Customers',
    fields: {
      name: { label: 'Name', type: 'text' },
      email: { label: 'Email', type: 'text' },
      phone: { label: 'Phone', type: 'text' },
      address: { label: 'Address', type: 'text' },
      totalPurchases: { label: 'Total Purchases', type: 'number' },
      totalSpent: { label: 'Total Spent', type: 'number' },
      outstandingCredit: { label: 'Outstanding Credit', type: 'number' },
      storeCreditBalance: { label: 'Store Credit', type: 'number' },
      createdAt: { label: 'Created', type: 'date' },
    },
  },
  vendors: {
    model: () => require('../models/Vendor'),
    label: 'Vendors',
    fields: {
      name: { label: 'Name', type: 'text' },
      email: { label: 'Email', type: 'text' },
      phone: { label: 'Phone', type: 'text' },
      createdAt: { label: 'Created', type: 'date' },
    },
  },
};

// Placeholders the email-template editor offers (rendered from the sample
// context below for previews/tests).
const PLACEHOLDER_DOC = [
  'business.name', 'business.phone', 'date',
  'customer.name', 'customer.email', 'customer.phone',
  'order.number', 'order.total', 'order.subtotal', 'order.discount', 'order.tax',
  'order.paymentMethod', 'order.balanceDue', 'order.itemCount',
  'cashier.name', 'items_table',
  'product.name', 'product.sku', 'product.stock', 'product.reorderLevel',
];

const sampleContext = (tenantName) => buildContext('sale.created', {
  sale: {
    orderNumber: 'SO-2026-0042',
    subtotal: 120000,
    totalDiscount: 5000,
    totalTax: 20700,
    grandTotal: 135700,
    paymentMethod: 'Cash',
    paymentStatus: 'paid',
    status: 'completed',
    createdAt: new Date(),
    items: [
      { name: 'Sample Product A', quantity: 2, price: 40000, total: 80000 },
      { name: 'Sample Product B', quantity: 1, price: 40000, total: 40000 },
    ],
    paymentDetails: { balanceDue: 0 },
    customerName: 'Jane Doe',
  },
  customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '+256 700 000000' },
}, { name: tenantName || 'Your Business' });

// ─── META ─────────────────────────────────────────────────────────────────────
// One payload that drives every builder UI on the Customization page.
exports.getMeta = async (req, res) => {
  const entities = {};
  for (const [key, cfg] of Object.entries(VIEW_CATALOG)) {
    entities[key] = { label: cfg.label, fields: cfg.fields };
  }
  res.json({
    success: true,
    data: {
      viewEntities: entities,
      customFieldEntities: ['product', 'customer', 'salesOrder', 'vendor'],
      documentTypes: ['invoice', 'receipt', 'quote', 'purchase-order'],
      placeholders: PLACEHOLDER_DOC,
    },
  });
};

// ═══ PDF TEMPLATES ════════════════════════════════════════════════════════════

const sanitizeDesign = (design = {}) => {
  const out = {};
  const color = (v, dflt) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? v : dflt);
  if (design.accentColor !== undefined) out['design.accentColor'] = color(design.accentColor, '#16A34A');
  if (design.textColor !== undefined) out['design.textColor'] = color(design.textColor, '#1E293B');
  if (design.fontFamily !== undefined) out['design.fontFamily'] = design.fontFamily;
  if (design.paperSize !== undefined) out['design.paperSize'] = design.paperSize;
  if (design.logoUrl !== undefined) out['design.logoUrl'] = String(design.logoUrl || '').slice(0, 500);
  if (design.headerText !== undefined) out['design.headerText'] = String(design.headerText || '').slice(0, 500);
  if (design.footerText !== undefined) out['design.footerText'] = String(design.footerText || '').slice(0, 500);
  for (const flag of ['showLogo', 'showBusinessInfo', 'showCustomerInfo', 'showCashier', 'showSku',
    'showDiscount', 'showTax', 'showPaymentInfo', 'showSignature']) {
    if (design[flag] !== undefined) out[`design.${flag}`] = Boolean(design[flag]);
  }
  if (design.labels !== undefined && typeof design.labels === 'object') {
    const labels = {};
    for (const [k, v] of Object.entries(design.labels || {})) {
      if (typeof v === 'string') labels[String(k).slice(0, 40)] = v.slice(0, 80);
    }
    out['design.labels'] = labels;
  }
  return out;
};

exports.getPdfTemplates = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const templates = await PdfTemplate.find({ tenantId: req.tenantId }).sort('-updatedAt');
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// The template a document viewer should use right now for a documentType.
exports.resolvePdfTemplate = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const documentType = String(req.query.documentType || 'invoice');
    const template =
      (await PdfTemplate.findOne({ tenantId: req.tenantId, documentType, isDefault: true })) ||
      (await PdfTemplate.findOne({ tenantId: req.tenantId, documentType }).sort('-updatedAt'));
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPdfTemplate = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Template name is required.' });
    const documentType = ['invoice', 'receipt', 'quote', 'purchase-order'].includes(req.body.documentType)
      ? req.body.documentType : 'invoice';

    if (req.body.isDefault) {
      await PdfTemplate.updateMany({ tenantId: req.tenantId, documentType }, { $set: { isDefault: false } });
    }
    const template = await PdfTemplate.create({
      tenantId: req.tenantId,
      name,
      documentType,
      isDefault: Boolean(req.body.isDefault),
      createdBy: req.user._id,
    });
    // Apply design via the same sanitizer used on update.
    const design = sanitizeDesign(req.body.design || {});
    if (Object.keys(design).length) {
      await PdfTemplate.updateOne({ _id: template._id }, { $set: design });
    }
    const fresh = await PdfTemplate.findById(template._id);
    res.status(201).json({ success: true, data: fresh });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePdfTemplate = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const update = sanitizeDesign(req.body.design || {});
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();

    const existing = await PdfTemplate.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!existing) return res.status(404).json({ success: false, message: 'Template not found.' });

    if (req.body.isDefault === true) {
      await PdfTemplate.updateMany(
        { tenantId: req.tenantId, documentType: existing.documentType },
        { $set: { isDefault: false } }
      );
      update.isDefault = true;
    } else if (req.body.isDefault === false) {
      update.isDefault = false;
    }

    const template = await PdfTemplate.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    );
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePdfTemplate = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const template = await PdfTemplate.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══ EMAIL TEMPLATES ══════════════════════════════════════════════════════════

exports.getEmailTemplates = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const templates = await EmailTemplate.find({ tenantId: req.tenantId }).sort('-updatedAt');
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEmailTemplate = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const name = String(req.body.name || '').trim();
    const subject = String(req.body.subject || '').trim();
    const bodyHtml = String(req.body.bodyHtml || '');
    if (!name || !subject || !bodyHtml) {
      return res.status(400).json({ success: false, message: 'Name, subject and body are all required.' });
    }
    const template = await EmailTemplate.create({
      tenantId: req.tenantId, name, subject, bodyHtml,
      isActive: req.body.isActive !== false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEmailTemplate = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.subject !== undefined) update.subject = String(req.body.subject).trim();
    if (req.body.bodyHtml !== undefined) update.bodyHtml = String(req.body.bodyHtml);
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);

    const template = await EmailTemplate.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEmailTemplate = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const template = await EmailTemplate.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Render subject/body with sample data — used by the editor's preview pane
// so what the author sees matches exactly what the engine will send.
exports.previewEmailTemplate = async (req, res) => {
  try {
    const context = sampleContext(req.user?.tenantName);
    res.json({
      success: true,
      data: {
        subject: render(String(req.body.subject || ''), context, { html: false }),
        bodyHtml: render(String(req.body.bodyHtml || ''), context),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Send a saved template to the requesting user (or a given address) with
// sample data, so deliverability can be checked end to end.
exports.testEmailTemplate = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const template = await EmailTemplate.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });

    const to = String(req.body.to || req.user.email || '').trim();
    if (!to) return res.status(400).json({ success: false, message: 'No recipient address available.' });

    const context = sampleContext();
    await sendMail(to, `[TEST] ${render(template.subject, context, { html: false })}`, render(template.bodyHtml, context));
    res.json({ success: true, message: `Test email sent to ${to}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══ CUSTOM FIELDS ════════════════════════════════════════════════════════════

const slugify = (label) =>
  String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

exports.getCustomFields = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const query = { tenantId: req.tenantId };
    if (req.query.entity) query.entity = String(req.query.entity);
    // Forms only want active fields; the manager wants everything.
    if (req.query.activeOnly === 'true') query.isActive = true;
    const fields = await CustomField.find(query).sort('entity order createdAt');
    res.json({ success: true, data: fields });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCustomField = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const label = String(req.body.label || '').trim();
    const entity = String(req.body.entity || '');
    if (!label) return res.status(400).json({ success: false, message: 'A field label is required.' });
    if (!['product', 'customer', 'salesOrder', 'vendor'].includes(entity)) {
      return res.status(400).json({ success: false, message: 'Invalid entity.' });
    }
    const key = slugify(label);
    if (!key) return res.status(400).json({ success: false, message: 'Label must contain letters or numbers.' });

    const type = ['text', 'textarea', 'number', 'date', 'select', 'checkbox'].includes(req.body.type)
      ? req.body.type : 'text';
    const field = await CustomField.create({
      tenantId: req.tenantId,
      entity, label, key, type,
      options: type === 'select' ? (req.body.options || []).map((o) => String(o).trim()).filter(Boolean) : [],
      required: Boolean(req.body.required),
      defaultValue: req.body.defaultValue ?? null,
      order: Number(req.body.order) || 0,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: field });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A field with that name already exists for this entity.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCustomField = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    // `key` and `entity` stay immutable so stored values never orphan.
    const update = {};
    if (req.body.label !== undefined) update.label = String(req.body.label).trim();
    if (req.body.type !== undefined && ['text', 'textarea', 'number', 'date', 'select', 'checkbox'].includes(req.body.type)) {
      update.type = req.body.type;
    }
    if (req.body.options !== undefined) {
      update.options = (req.body.options || []).map((o) => String(o).trim()).filter(Boolean);
    }
    if (req.body.required !== undefined) update.required = Boolean(req.body.required);
    if (req.body.defaultValue !== undefined) update.defaultValue = req.body.defaultValue;
    if (req.body.order !== undefined) update.order = Number(req.body.order) || 0;
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);

    const field = await CustomField.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!field) return res.status(404).json({ success: false, message: 'Field not found.' });
    res.json({ success: true, data: field });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCustomField = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const field = await CustomField.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!field) return res.status(404).json({ success: false, message: 'Field not found.' });
    // Stored values on records are left in place — harmless orphans that
    // reappear if a field with the same key is ever recreated.
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══ CUSTOM VIEWS ═════════════════════════════════════════════════════════════

const validateViewShape = (body, res) => {
  const entity = String(body.entity || '');
  const catalog = VIEW_CATALOG[entity];
  if (!catalog) {
    res.status(400).json({ success: false, message: 'Invalid entity.' });
    return null;
  }
  const fieldOk = (f) => Object.prototype.hasOwnProperty.call(catalog.fields, f);

  const filters = (body.filters || [])
    .filter((f) => f && fieldOk(f.field))
    .map((f) => ({
      field: f.field,
      operator: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains'].includes(f.operator) ? f.operator : 'eq',
      value: f.value,
    }));
  const columns = (body.columns || []).filter(fieldOk);
  const sortField = fieldOk(body.sort?.field) ? body.sort.field : 'createdAt';
  return {
    entity,
    filters,
    columns: columns.length ? columns : Object.keys(catalog.fields).slice(0, 5),
    sort: { field: sortField, direction: body.sort?.direction === 'asc' ? 'asc' : 'desc' },
  };
};

// Views are visible if shared or your own.
const viewVisibleQuery = (req) => ({
  tenantId: req.tenantId,
  $or: [{ isShared: true }, { createdBy: req.user._id }],
});

exports.getCustomViews = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const views = await CustomView.find(viewVisibleQuery(req)).sort('-updatedAt').populate('createdBy', 'name');
    res.json({ success: true, data: views });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCustomView = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'A view name is required.' });
    const shape = validateViewShape(req.body, res);
    if (!shape) return;

    const view = await CustomView.create({
      tenantId: req.tenantId,
      name,
      description: String(req.body.description || '').trim(),
      ...shape,
      isShared: req.body.isShared !== false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: view });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCustomView = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const existing = await CustomView.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!existing) return res.status(404).json({ success: false, message: 'View not found.' });

    const shape = validateViewShape({ ...req.body, entity: req.body.entity || existing.entity }, res);
    if (!shape) return;

    const update = { ...shape };
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.description !== undefined) update.description = String(req.body.description).trim();
    if (req.body.isShared !== undefined) update.isShared = Boolean(req.body.isShared);

    const view = await CustomView.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: update },
      { new: true, runValidators: true }
    );
    res.json({ success: true, data: view });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCustomView = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const view = await CustomView.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!view) return res.status(404).json({ success: false, message: 'View not found.' });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Execute a view server-side and return its rows.
exports.getCustomViewData = async (req, res) => {
  if (!isDbConnected()) return dbGuard(res);
  try {
    const view = await CustomView.findOne({ _id: req.params.id, ...viewVisibleQuery(req) });
    if (!view) return res.status(404).json({ success: false, message: 'View not found.' });

    const catalog = VIEW_CATALOG[view.entity];
    const Model = catalog.model();

    const query = { tenantId: req.tenantId };
    for (const f of view.filters || []) {
      const fieldType = catalog.fields[f.field]?.type;
      if (!fieldType) continue;

      let value = f.value;
      if (fieldType === 'number') value = Number(value);
      if (fieldType === 'date') value = new Date(value);

      let clause;
      switch (f.operator) {
        case 'neq': clause = { $ne: value }; break;
        case 'gt': clause = { $gt: value }; break;
        case 'gte': clause = { $gte: value }; break;
        case 'lt': clause = { $lt: value }; break;
        case 'lte': clause = { $lte: value }; break;
        case 'contains': clause = { $regex: escapeRegex(f.value), $options: 'i' }; break;
        case 'not_contains': clause = { $not: { $regex: escapeRegex(f.value), $options: 'i' } }; break;
        default:
          // Text equality is case-insensitive exact match.
          clause = fieldType === 'text'
            ? { $regex: `^${escapeRegex(f.value)}$`, $options: 'i' }
            : { $eq: value };
      }
      // Multiple filters on one field AND together.
      query[f.field] = query[f.field] ? { ...query[f.field], ...clause } : clause;
    }

    const sort = { [view.sort?.field || 'createdAt']: view.sort?.direction === 'asc' ? 1 : -1 };
    const [rows, total] = await Promise.all([
      Model.find(query).select(view.columns.join(' ')).sort(sort).limit(500).lean(),
      Model.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        view,
        columns: view.columns.map((c) => ({ key: c, ...catalog.fields[c] })),
        rows,
        total,
        truncated: total > rows.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
