const mongoose = require('mongoose');
const SalesOrder = require('../models/SalesOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const Return = require('../models/Return');
const Expense = require('../models/Expense');
const User = require('../models/User');

// Shared report builders — consumed by both the /api/reports endpoints and
// the scheduled-report runner, so an emailed report and the on-screen one
// can never disagree.

const oid = (v) => new mongoose.Types.ObjectId(String(v));

const AGE_BUCKETS = [
  { key: 'current', label: 'Current', maxDays: 0 },
  { key: 'd30', label: '1–30 days', maxDays: 30 },
  { key: 'd60', label: '31–60 days', maxDays: 60 },
  { key: 'd90', label: '61–90 days', maxDays: 90 },
  { key: 'over90', label: 'Over 90 days', maxDays: Infinity },
];

function ageBucket(referenceDate) {
  if (!referenceDate) return 'current';
  const days = Math.floor((Date.now() - new Date(referenceDate).getTime()) / 86400000);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return 'over90';
}

// ─── RECEIVABLES: who owes the business money ────────────────────────────────
// Credit sales with balanceDue > 0, grouped per customer with aging buckets
// keyed off the bill's due date (falling back to the sale date).
async function buildReceivables(tenantId) {
  const bills = await SalesOrder.find({
    tenantId,
    status: { $ne: 'voided' },
    'paymentDetails.balanceDue': { $gt: 0 },
  }).populate('customerId', 'name phone').select('orderNumber customerName customerId grandTotal paymentDetails createdAt');

  const byCustomer = new Map();
  const totals = { total: 0, current: 0, d30: 0, d60: 0, d90: 0, over90: 0, billCount: bills.length };

  for (const bill of bills) {
    const due = Number(bill.paymentDetails?.balanceDue) || 0;
    const key = String(bill.customerId?._id || bill.customerName || 'unknown');
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        customerId: bill.customerId?._id || null,
        customerName: bill.customerId?.name || bill.customerName || 'Walk-in Customer',
        phone: bill.customerId?.phone || '',
        total: 0, current: 0, d30: 0, d60: 0, d90: 0, over90: 0,
        bills: [],
      });
    }
    const row = byCustomer.get(key);
    const bucket = ageBucket(bill.paymentDetails?.balanceDueDate || bill.createdAt);
    row[bucket] += due;
    row.total += due;
    totals[bucket] += due;
    totals.total += due;
    row.bills.push({
      salesOrderId: bill._id,
      orderNumber: bill.orderNumber,
      balanceDue: due,
      dueDate: bill.paymentDetails?.balanceDueDate || null,
      createdAt: bill.createdAt,
    });
  }

  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  return { rows, totals, buckets: AGE_BUCKETS };
}

// ─── PAYABLES: who the business owes ─────────────────────────────────────────
// Non-cancelled, non-draft POs with an unpaid remainder, grouped per vendor
// with aging keyed off the PO's expected date (falling back to creation).
async function buildPayables(tenantId) {
  const pos = await PurchaseOrder.find({
    tenantId,
    status: { $nin: ['cancelled', 'draft'] },
    $expr: { $gt: [{ $subtract: [{ $ifNull: ['$grandTotal', 0] }, { $ifNull: ['$paidAmount', 0] }] }, 0.009] },
  }).populate('vendorId', 'name phone').select('poNumber vendorId grandTotal paidAmount expectedDate createdAt status');

  const byVendor = new Map();
  const totals = { total: 0, current: 0, d30: 0, d60: 0, d90: 0, over90: 0, billCount: pos.length };

  for (const po of pos) {
    const owed = Math.max(0, (Number(po.grandTotal) || 0) - (Number(po.paidAmount) || 0));
    const key = String(po.vendorId?._id || 'unknown');
    if (!byVendor.has(key)) {
      byVendor.set(key, {
        vendorId: po.vendorId?._id || null,
        vendorName: po.vendorId?.name || 'Unknown Vendor',
        phone: po.vendorId?.phone || '',
        total: 0, current: 0, d30: 0, d60: 0, d90: 0, over90: 0,
        bills: [],
      });
    }
    const row = byVendor.get(key);
    const bucket = ageBucket(po.expectedDate || po.createdAt);
    row[bucket] += owed;
    row.total += owed;
    totals[bucket] += owed;
    totals.total += owed;
    row.bills.push({
      purchaseOrderId: po._id,
      poNumber: po.poNumber,
      owed,
      grandTotal: po.grandTotal || 0,
      paidAmount: po.paidAmount || 0,
      status: po.status,
      expectedDate: po.expectedDate || null,
    });
  }

  const rows = [...byVendor.values()].sort((a, b) => b.total - a.total);
  return { rows, totals, buckets: AGE_BUCKETS };
}

// ─── CUSTOM REPORT BUILDER ───────────────────────────────────────────────────
// Executes an aggregation assembled ONLY from whitelisted pieces — the
// client picks an entity, a grouping, and a date range; nothing it sends is
// ever spliced into a query as-is.
const TIME_FORMATS = { day: '%Y-%m-%d', week: '%G-W%V', month: '%Y-%m' };

const CUSTOM_ENTITIES = {
  sales: {
    model: SalesOrder,
    baseMatch: { status: { $ne: 'voided' } },
    groups: {
      day: { key: { $dateToString: { format: TIME_FORMATS.day, date: '$createdAt' } } },
      week: { key: { $dateToString: { format: TIME_FORMATS.week, date: '$createdAt' } } },
      month: { key: { $dateToString: { format: TIME_FORMATS.month, date: '$createdAt' } } },
      customer: { key: { $ifNull: ['$customerName', 'Walk-in Customer'] } },
      paymentMethod: { key: { $ifNull: ['$paymentMethod', 'Cash'] } },
      cashier: { key: '$cashierId', resolve: 'user' },
      product: { unwind: '$items', key: '$items.name' },
    },
    metrics: {
      count: { $sum: 1 },
      total: { $sum: { $ifNull: ['$grandTotal', 0] } },
      tax: { $sum: { $ifNull: ['$totalTax', 0] } },
      discount: { $sum: { $ifNull: ['$totalDiscount', 0] } },
    },
    // When unwound by product, order-level totals would double-count — the
    // line's own numbers are used instead.
    unwoundMetrics: {
      count: { $sum: { $ifNull: ['$items.quantity', 0] } },
      total: { $sum: { $ifNull: ['$items.total', 0] } },
      tax: { $sum: { $ifNull: ['$items.tax', 0] } },
      discount: { $sum: { $ifNull: ['$items.discount', 0] } },
    },
  },
  returns: {
    model: Return,
    baseMatch: { status: { $in: ['completed', 'pending'] } },
    groups: {
      day: { key: { $dateToString: { format: TIME_FORMATS.day, date: '$createdAt' } } },
      month: { key: { $dateToString: { format: TIME_FORMATS.month, date: '$createdAt' } } },
      customer: { key: { $ifNull: ['$customerName', 'Walk-in Customer'] } },
      reason: { key: { $ifNull: ['$reason', 'Other'] } },
      refundMethod: { key: { $ifNull: ['$refundMethod', 'Cash'] } },
    },
    metrics: {
      count: { $sum: 1 },
      total: { $sum: { $ifNull: ['$totalAmount', 0] } },
    },
  },
  purchases: {
    model: PurchaseOrder,
    baseMatch: { status: { $ne: 'cancelled' } },
    groups: {
      day: { key: { $dateToString: { format: TIME_FORMATS.day, date: '$createdAt' } } },
      month: { key: { $dateToString: { format: TIME_FORMATS.month, date: '$createdAt' } } },
      vendor: { key: '$vendorId', resolve: 'vendor' },
      status: { key: '$status' },
    },
    metrics: {
      count: { $sum: 1 },
      total: { $sum: { $ifNull: ['$grandTotal', 0] } },
      paid: { $sum: { $ifNull: ['$paidAmount', 0] } },
      outstanding: { $sum: { $subtract: [{ $ifNull: ['$grandTotal', 0] }, { $ifNull: ['$paidAmount', 0] }] } },
    },
  },
  expenses: {
    model: Expense,
    baseMatch: {},
    groups: {
      day: { key: { $dateToString: { format: TIME_FORMATS.day, date: '$createdAt' } } },
      month: { key: { $dateToString: { format: TIME_FORMATS.month, date: '$createdAt' } } },
      category: { key: { $ifNull: ['$category', 'Uncategorized'] } },
    },
    metrics: {
      count: { $sum: 1 },
      total: { $sum: { $ifNull: ['$amount', 0] } },
    },
  },
};

async function buildCustomReport(tenantId, config = {}) {
  const entityDef = CUSTOM_ENTITIES[config.entity];
  if (!entityDef) {
    throw Object.assign(new Error(`Unknown entity "${config.entity}". Valid: ${Object.keys(CUSTOM_ENTITIES).join(', ')}.`), { status: 400 });
  }
  const groupDef = entityDef.groups[config.groupBy];
  if (!groupDef) {
    throw Object.assign(new Error(`Unknown grouping "${config.groupBy}" for ${config.entity}. Valid: ${Object.keys(entityDef.groups).join(', ')}.`), { status: 400 });
  }

  const match = { tenantId: oid(tenantId), ...entityDef.baseMatch };
  if (config.from || config.to) {
    match.createdAt = {};
    if (config.from) match.createdAt.$gte = new Date(config.from);
    if (config.to) {
      const to = new Date(config.to);
      to.setHours(23, 59, 59, 999);
      match.createdAt.$lte = to;
    }
  }

  const metricDefs = (groupDef.unwind && entityDef.unwoundMetrics) ? entityDef.unwoundMetrics : entityDef.metrics;
  const wanted = Array.isArray(config.metrics) && config.metrics.length
    ? config.metrics.filter((m) => metricDefs[m])
    : Object.keys(metricDefs);
  if (wanted.length === 0) {
    throw Object.assign(new Error(`No valid metrics. Valid: ${Object.keys(metricDefs).join(', ')}.`), { status: 400 });
  }

  const groupStage = { _id: groupDef.key };
  for (const m of wanted) groupStage[m] = metricDefs[m];

  const pipeline = [{ $match: match }];
  if (groupDef.unwind) pipeline.push({ $unwind: groupDef.unwind });
  pipeline.push({ $group: groupStage });
  pipeline.push({ $sort: config.groupBy in TIME_FORMATS ? { _id: 1 } : { [wanted.includes('total') ? 'total' : wanted[0]]: -1 } });
  pipeline.push({ $limit: 500 });

  let rows = await entityDef.model.aggregate(pipeline);

  // Resolve id-valued group keys (cashier/vendor) to display names.
  if (groupDef.resolve === 'user') {
    const users = await User.find({ _id: { $in: rows.map((r) => r._id).filter(Boolean) } }).select('name');
    const names = new Map(users.map((u) => [String(u._id), u.name]));
    rows = rows.map((r) => ({ ...r, _id: names.get(String(r._id)) || 'Unknown' }));
  } else if (groupDef.resolve === 'vendor') {
    const Vendor = require('../models/Vendor');
    const vendors = await Vendor.find({ _id: { $in: rows.map((r) => r._id).filter(Boolean) } }).select('name');
    const names = new Map(vendors.map((v) => [String(v._id), v.name]));
    rows = rows.map((r) => ({ ...r, _id: names.get(String(r._id)) || 'Unknown' }));
  }

  const round = (n) => typeof n === 'number' ? Math.round(n * 100) / 100 : n;
  rows = rows.map((r) => {
    const out = { group: r._id == null ? '(none)' : String(r._id) };
    for (const m of wanted) out[m] = round(r[m]);
    return out;
  });

  const totals = {};
  for (const m of wanted) totals[m] = round(rows.reduce((s, r) => s + (Number(r[m]) || 0), 0));

  return { entity: config.entity, groupBy: config.groupBy, metrics: wanted, rows, totals };
}

// ─── SALES SUMMARY (for scheduled emails) ────────────────────────────────────
async function buildSalesSummary(tenantId, { from, to } = {}) {
  return buildCustomReport(tenantId, {
    entity: 'sales', groupBy: 'day', metrics: ['count', 'total', 'tax', 'discount'], from, to,
  });
}

module.exports = { buildReceivables, buildPayables, buildCustomReport, buildSalesSummary, AGE_BUCKETS };
