const mongoose = require('mongoose');
const Return = require('../models/Return');
const SalesOrder = require('../models/SalesOrder');
const Branch = require('../models/Branch');
const Tenant = require('../models/Tenant');
const { releaseAtomic, releaseForOrderItem } = require('../utils/stockOps');
const { issueFromReturn } = require('./creditNoteController');
const { logActivity } = require('../utils/audit');

const isDbConnected = () => mongoose.connection.readyState === 1;

// Restock one returned line. Looks up the original sale line so a returned
// composite (bundle) restores its COMPONENTS' stock — the recipe captured at
// sale time — instead of the bundle product, whose stock is never tracked.
// Ordinary lines restore themselves exactly as before. Serial/batch ledgers
// are deliberately NOT touched here: returned tracked units go back through
// the Tracking page after inspection (a returned serial shows as 'sold'
// until manually re-activated), so damaged units can't silently re-enter
// sellable serial stock.
const restockReturnItem = async (tenantId, branchId, saleDoc, item) => {
  const saleLine = saleDoc?.items?.find((si) => String(si.productId) === String(item.productId));
  if (saleLine?.componentsConsumed?.length) {
    await releaseForOrderItem({
      tenantId, branchId, orderItem: saleLine, qty: Number(item.quantity),
    });
    return;
  }
  await releaseAtomic({ tenantId, productId: item.productId, branchId, qty: Number(item.quantity) });
};

// GET /api/returns
exports.getReturns = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId: req.tenantId };
    const [total, returns] = await Promise.all([
      Return.countDocuments(query),
      Return.find(query).sort('-createdAt').skip(skip).limit(Number(limit))
        .populate('originalSaleId', 'orderNumber')
        .populate('processedBy', 'name')
        .populate('customerId', 'name'),
    ]);
    res.json({ success: true, data: returns, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/returns — process a return and restore inventory
exports.createReturn = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { originalSaleId, items, reason, refundMethod, customerName, customerId, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Return must have at least one item.' });
    if (refundMethod === 'Store Credit' && (!customerId || !mongoose.Types.ObjectId.isValid(customerId))) {
      return res.status(400).json({ success: false, message: 'Store Credit refunds require a customer to be selected.' });
    }

    // ─── Validate against the original sale ──────────────────────────────────
    // Previously any productId/quantity could be submitted with no check that
    // it matches what was actually sold — a clean fraud path (fabricate a
    // return, inventory gets restored, refund gets issued, no matching sale
    // required). A return must reference a real sale for this tenant, and
    // each returned quantity is capped at what that sale's line item sold
    // minus whatever has already been returned against it.
    if (!originalSaleId || !mongoose.Types.ObjectId.isValid(originalSaleId)) {
      return res.status(400).json({ success: false, message: 'A valid original sale is required to process a return.' });
    }
    const originalSale = await SalesOrder.findOne({ _id: originalSaleId, tenantId: req.tenantId });
    if (!originalSale) {
      return res.status(404).json({ success: false, message: 'Original sale not found for this business.' });
    }

    const priorReturns = await Return.find({ tenantId: req.tenantId, originalSaleId });
    const alreadyReturnedByProduct = {};
    for (const r of priorReturns) {
      for (const ri of r.items) {
        const key = String(ri.productId);
        alreadyReturnedByProduct[key] = (alreadyReturnedByProduct[key] || 0) + Number(ri.quantity);
      }
    }

    for (const item of items) {
      const soldLine = originalSale.items.find((si) => String(si.productId) === String(item.productId));
      if (!soldLine) {
        return res.status(400).json({ success: false, message: `"${item.name || 'Item'}" was not part of the original sale.` });
      }
      const alreadyReturned = alreadyReturnedByProduct[String(item.productId)] || 0;
      const remainingReturnable = Number(soldLine.quantity) - alreadyReturned;
      if (Number(item.quantity) > remainingReturnable) {
        return res.status(400).json({
          success: false,
          message: `Cannot return ${item.quantity} of "${item.name || soldLine.name}" — only ${Math.max(0, remainingReturnable)} unit(s) remain returnable from this sale.`,
        });
      }
      // Trust the sale's own recorded price, not whatever the client sends,
      // so a refund can't be inflated above what was actually charged.
      item.price = soldLine.price;
    }

    // Get branch
    const branch = await Branch.findOne({ tenantId: req.tenantId, isDefault: true }) || await Branch.findOne({ tenantId: req.tenantId });
    const branchId = branch?._id;

    // Generate return number
    const count = await Return.countDocuments({ tenantId: req.tenantId });
    const returnNumber = `RET-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const totalAmount = items.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity)), 0);
    const originalOrderNumber = originalSale.orderNumber || '';

    // ─── Approval gate ──────────────────────────────────────────────────────
    // Off by default (tenant.settings.returns.requireApproval) — a tenant
    // that has never touched this setting sees byte-for-byte the same
    // instant create-and-restock behavior returns have always had. Opting in
    // (globally, or above a dollar threshold) defers the actual stock
    // restoration to a separate approve step instead.
    const tenant = await Tenant.findById(req.tenantId).select('settings.returns');
    const returnSettings = tenant?.settings?.returns || {};
    const threshold = returnSettings.approvalThreshold;
    const needsApproval = Boolean(returnSettings.requireApproval)
      || (threshold != null && totalAmount > threshold);

    const returnDoc = await Return.create({
      tenantId: req.tenantId,
      returnNumber,
      originalSaleId: originalSaleId || undefined,
      originalOrderNumber,
      branchId,
      processedBy: req.user._id,
      customerId: customerId || undefined,
      customerName: customerName || 'Walk-in Customer',
      items: items.map(i => ({
        productId: i.productId,
        name: i.name,
        sku: i.sku || '',
        quantity: Number(i.quantity),
        price: Number(i.price),
        total: Number(i.price) * Number(i.quantity),
      })),
      totalAmount,
      reason: reason || 'Other',
      refundMethod: refundMethod || 'Cash',
      status: needsApproval ? 'pending' : 'completed',
      stockRestored: !needsApproval,
      restoredAt: needsApproval ? undefined : new Date(),
      notes,
    });

    if (!needsApproval) {
      for (const item of items) {
        if (!item.productId) continue;
        await restockReturnItem(req.tenantId, branchId, originalSale, item);
      }
      if (refundMethod === 'Store Credit') {
        try {
          const note = await issueFromReturn(returnDoc, req.user._id);
          returnDoc.creditNoteId = note._id;
          await returnDoc.save();
        } catch (ccErr) {
          console.error('Issue credit note error:', ccErr.message);
        }
      }
    }

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'return_created', entity: 'Return', entityId: returnDoc._id,
      description: `Return ${returnNumber} on ${originalOrderNumber} \u2014 ${totalAmount.toLocaleString()} (${refundMethod || 'Cash'})`,
    });

    // Automation: workflow rules & webhooks subscribed to returns.
    require('../services/automationEngine').emitEvent(req.tenantId, 'return.created', { return: returnDoc });

    res.status(201).json({ success: true, data: returnDoc });
  } catch (err) {
    console.error('Create return error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/returns/:id
exports.getReturn = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const ret = await Return.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('originalSaleId', 'orderNumber')
      .populate('processedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('customerId', 'name');
    if (!ret) return res.status(404).json({ success: false, message: 'Return not found.' });
    res.json({ success: true, data: ret });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/returns/:id/approve — restores stock (once) and completes the return
exports.approveReturn = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    // Conditional on status:'pending' so a double-click / retry can't
    // approve (and therefore restock) the same return twice.
    const ret = await Return.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: 'pending' },
      { $set: { approvedBy: req.user._id, approvedAt: new Date() } },
      { new: true }
    );
    if (!ret) {
      return res.status(404).json({ success: false, message: 'Pending return not found (already processed?).' });
    }

    if (!ret.stockRestored) {
      const originalSale = ret.originalSaleId
        ? await SalesOrder.findOne({ _id: ret.originalSaleId, tenantId: req.tenantId })
        : null;
      for (const item of ret.items) {
        if (!item.productId) continue;
        await restockReturnItem(req.tenantId, ret.branchId, originalSale, item);
      }
      ret.stockRestored = true;
      ret.restoredAt = new Date();
    }

    if (ret.refundMethod === 'Store Credit' && !ret.creditNoteId) {
      try {
        const note = await issueFromReturn(ret, req.user._id);
        ret.creditNoteId = note._id;
      } catch (ccErr) {
        console.error('Issue credit note error:', ccErr.message);
      }
    }

    ret.status = 'completed';
    await ret.save();

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'return_approved', entity: 'Return', entityId: ret._id,
      description: `Approved return ${ret.returnNumber} \u2014 stock restored`,
    });

    res.json({ success: true, data: ret });
  } catch (err) {
    console.error('Approve return error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/returns/:id/reject — no stock movement
exports.rejectReturn = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const ret = await Return.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: 'pending' },
      { $set: { status: 'rejected', approvedBy: req.user._id, approvedAt: new Date(), rejectedReason: req.body.reason || '' } },
      { new: true }
    );
    if (!ret) {
      return res.status(404).json({ success: false, message: 'Pending return not found (already processed?).' });
    }
    res.json({ success: true, data: ret });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Returns settings (per tenant) ─────────────────────────────────────────
exports.getReturnSettings = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const tenant = await Tenant.findById(req.tenantId).select('settings.returns');
    res.json({ success: true, data: tenant?.settings?.returns || { requireApproval: false, approvalThreshold: null } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateReturnSettings = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const requireApproval = Boolean(req.body.requireApproval);
    const approvalThreshold = (req.body.approvalThreshold === '' || req.body.approvalThreshold == null)
      ? null
      : Number(req.body.approvalThreshold);
    const tenant = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $set: { 'settings.returns.requireApproval': requireApproval, 'settings.returns.approvalThreshold': approvalThreshold } },
      { new: true }
    ).select('settings.returns');
    res.json({ success: true, data: tenant.settings.returns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
