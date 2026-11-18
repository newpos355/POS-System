const mongoose = require('mongoose');
const SalesOrder = require('../models/SalesOrder');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const Customer = require('../models/Customer');
const Return = require('../models/Return');
const CreditNote = require('../models/CreditNote');
const Vendor = require('../models/Vendor');
const SerialNumber = require('../models/SerialNumber');
const Batch = require('../models/Batch');
const { createNotification } = require('./notificationController');
const { emitEvent } = require('../services/automationEngine');
const { logActivity } = require('../utils/audit');
const {
  releaseAtomic, reserveAtomic, reserveUpTo, releaseForOrderItem, allocateBatchesFEFO,
} = require('../utils/stockOps');
const {
  createPOFromSalesLines, createPOFromRefs, recomputeFulfillmentStatus,
} = require('../services/salesToPurchase');

const isDbConnected = () => mongoose.connection.readyState === 1;

const getDefaultBranch = async (tenantId) => {
  return await Branch.findOne({ tenantId, isDefault: true })
    || await Branch.findOne({ tenantId });
};

// Reverts serial consumptions and batch takes from a failed checkout attempt.
async function rollbackTracking(tenantId, consumedSerials, consumedBatches) {
  for (const entry of consumedSerials) {
    await SerialNumber.updateMany(
      { tenantId, productId: entry.productId, serial: { $in: entry.serials }, status: 'sold' },
      { $set: { status: 'in_stock' }, $unset: { soldAt: 1 } }
    );
  }
  for (const take of consumedBatches) {
    await Batch.findOneAndUpdate(
      { _id: take.batchId, tenantId },
      { $inc: { quantity: take.quantity } }
    );
  }
}

// ─── CREATE SALE ───────────────────────────────────────────────────────────────
exports.createSale = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    // subtotal/totalTax/grandTotal/balanceDue are intentionally NOT read from
    // req.body — they're recomputed server-side from items[] below so a
    // client can't submit real items (which deduct real stock) alongside a
    // fabricated total.
    const { items, paymentMethod, customerId, customerName,
            discount, notes, paymentDetails, transactionId,
            amountPaid, balanceDueDate } = req.body;

    // ─── Idempotency Check ────────────────────────────────────────────────────
    // Frontend should send a unique UUID per sale attempt in the header or body.
    // If the same key is submitted again (retry, double-tap), return the existing sale.
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
    if (idempotencyKey) {
      const existing = await SalesOrder.findOne({
        tenantId: req.tenantId,
        idempotencyKey,
      }).populate('customerId', 'name phone').populate('cashierId', 'name');
      if (existing) {
        console.log(`[IDEMPOTENCY] Duplicate sale request blocked — key: ${idempotencyKey}`);
        return res.status(200).json({ success: true, data: existing, idempotent: true });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Sale must have at least one item.' });
    }

    // ─── Credit Block Check ───────────────────────────────────────────────────
    const isCreditSale = ['Credit Sale', 'credit', 'CREDIT', 'Pay Later'].includes(paymentMethod);
    if (isCreditSale && customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      const cust = await Customer.findOne({ _id: customerId, tenantId: req.tenantId });
      if (cust && cust.creditBlocked) {
        return res.status(403).json({
          success: false,
          message: `Credit sales are blocked for "${cust.name}". Please settle outstanding balance first or contact the admin.`,
        });
      }
    }

    // ─── Recompute totals from the actual line items ─────────────────────────
    // The client-submitted subtotal/tax/discount/grandTotal used to be trusted
    // as-is (validation only checked grandTotal >= 0) — a cashier could ring up
    // real items (which correctly deduct real stock) while submitting an
    // arbitrary near-zero grandTotal. Every total below is derived from
    // items[], not from req.body.
    let computedSubtotal = 0;
    let computedItemDiscount = 0;
    let computedItemTax = 0;
    const normalizedItems = items.map((item) => {
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const itemDiscount = Number(item.discount) || 0;
      const itemTax = Number(item.tax) || 0;
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) {
        throw Object.assign(new Error(`Invalid quantity or price for "${item.name || 'item'}".`), { status: 400 });
      }
      const lineGross = price * quantity;
      const lineTotal = lineGross - itemDiscount + itemTax;
      computedSubtotal += lineGross;
      computedItemDiscount += itemDiscount;
      computedItemTax += itemTax;
      return {
        productId: item.productId,
        name: item.name,
        sku: item.sku || '',
        quantity,
        price,
        discount: itemDiscount,
        tax: itemTax,
        total: lineTotal,
        // Client fulfillment requests — verified against the Product's own
        // flags in the reserve loop below before they have any effect. Both
        // are stripped by the schema when the sale is saved.
        wantsDropship: item.fulfillmentMode === 'dropship',
        wantsBackorder: item.allowBackorder === true,
        // Named units for serial-tracked lines — validated and consumed in
        // the reserve loop (only kept on the saved line once they all held).
        serials: Array.isArray(item.serials) ? item.serials : undefined,
      };
    });

    // An order-level discount (e.g. a manual "$5 off this sale") is trusted
    // only up to what the line items actually add up to — it can reduce the
    // total but never manufacture a bigger discount than the sale contains.
    const orderLevelDiscount = Math.min(Math.max(Number(discount) || 0, 0), computedSubtotal);
    const computedTotalDiscount = computedItemDiscount + orderLevelDiscount;
    const computedGrandTotal = Math.max(0, computedSubtotal - computedTotalDiscount + computedItemTax);

    // ─── Split tender: validate the tender lines up front ────────────────────
    // Checked before any stock is reserved so a malformed split costs
    // nothing. Coverage is re-checked just before the sale is written (store
    // credit is redeemed in between and could come up short in a race).
    const isSplit = paymentMethod === 'Split';
    const splitPayments = [];
    let splitTotal = 0;
    let splitCashTender = 0;
    if (isSplit) {
      const allowedTenders = ['Cash', 'Card', 'Airtel Money', 'MTN MoMo', 'Bank Transfer', 'Other'];
      const raw = Array.isArray(req.body.payments) ? req.body.payments : [];
      for (const p of raw) {
        const amount = Number(p.amount);
        if (!allowedTenders.includes(p.method) || !Number.isFinite(amount) || amount <= 0) {
          return res.status(400).json({ success: false, message: 'Each split tender needs a valid method and a positive amount.' });
        }
        splitPayments.push({
          method: p.method,
          amount,
          reference: p.reference ? String(p.reference).slice(0, 100) : undefined,
          receivedBy: req.user._id,
        });
        splitTotal += amount;
        if (p.method === 'Cash') splitCashTender += amount;
      }
      if (splitPayments.length < 2) {
        return res.status(400).json({ success: false, message: 'A split payment needs at least two tender lines.' });
      }
      const expectedRemainder = computedGrandTotal
        - Math.min(Math.max(Number(req.body.storeCreditApplied) || 0, 0), computedGrandTotal);
      if (splitTotal < expectedRemainder - 0.01) {
        return res.status(400).json({ success: false, message: `Split tenders (${splitTotal}) don't cover the amount due (${expectedRemainder}).` });
      }
      // Overpayment is only meaningful as cash handed over awaiting change —
      // a card can't be charged extra and then refunded from the drawer.
      if (splitTotal - expectedRemainder > splitCashTender + 0.01) {
        return res.status(400).json({ success: false, message: 'Change can only be given from the cash tender — reduce the non-cash amounts.' });
      }
    }

    // ─── Atomically reserve stock — closes the check-then-act oversell race ──
    // Each decrement is conditional ("only if enough stock exists right now")
    // and atomic at the database level, so two concurrent checkouts for the
    // last unit can no longer both succeed. Prefer the branch-level Inventory
    // record when one exists (it's what the Inventory/Product screens actually
    // show); fall back to Product.stock for products with no Inventory row yet.
    const branch = await getDefaultBranch(req.tenantId);
    const branchId = req.body.branchId || (branch ? branch._id : null);

    // One preloaded lookup for every per-product flag the loop needs
    // (dropship/backorder eligibility, tracking type, composite recipe) —
    // flags only; every stock mutation below stays an atomic conditional
    // update, never a decision made from these possibly-stale reads.
    const flagIds = normalizedItems
      .map((i) => i.productId)
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id));
    const flagDocs = flagIds.length
      ? await Product.find({ _id: { $in: flagIds }, tenantId: req.tenantId })
          .select('name allowBackorder isDropship preferredVendorId trackingType isComposite components')
      : [];
    const productFlags = new Map(flagDocs.map((p) => [String(p._id), p]));

    const reserved = [];
    const consumedSerials = [];   // [{productId, serials:[...]}] — for rollback
    const consumedBatches = [];   // [{batchId, quantity}] — for rollback
    let stockError = null;
    for (const item of normalizedItems) {
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) continue;
      const qty = item.quantity;
      const flags = productFlags.get(String(item.productId));
      const isSerialTracked = flags?.trackingType === 'serial';
      const isBatchTracked = flags?.trackingType === 'batch';
      // Only validated-and-consumed serials may reach the saved sale — a
      // client can't decorate a non-tracked line with arbitrary serials.
      if (!isSerialTracked) delete item.serials;

      // ── Composite (bundle) lines deduct their COMPONENTS, never their own
      // stock. Each component reserve is the same atomic conditional update
      // as any ordinary line; a failed component rolls back with everything
      // else via the shared `reserved` list. The per-unit recipe is captured
      // on the line so void/cancel/return can restore the right products.
      if (flags?.isComposite && flags.components?.length) {
        const recipe = flags.components.filter((c) => c.productId && Number(c.quantity) > 0);
        if (recipe.length === 0) {
          stockError = `Bundle "${item.name}" has no components configured.`;
          break;
        }
        let failedComp = null;
        for (const comp of recipe) {
          const need = Number(comp.quantity) * qty;
          const resv = await reserveAtomic({
            tenantId: req.tenantId, productId: comp.productId, branchId, qty: need,
          });
          if (!resv.ok) { failedComp = comp; break; }
          reserved.push({
            productId: comp.productId, branchId, qty: need,
            viaInventory: resv.viaInventory, name: comp.name, finalStock: resv.finalStock,
          });
        }
        if (failedComp) {
          stockError = `Insufficient stock of component "${failedComp.name}" for bundle "${item.name}".`;
          break;
        }
        item.componentsConsumed = recipe.map((c) => ({
          productId: c.productId, name: c.name, qtyPerUnit: Number(c.quantity),
        }));
        item.reservedQty = qty;
        continue;
      }

      // ── Serial-tracked lines must name the exact units being sold, and
      // are never dropship/backorder eligible (those paths have no on-hand
      // units to name). Validated before anything is deducted.
      let lineSerials = [];
      if (isSerialTracked) {
        lineSerials = [...new Set((Array.isArray(item.serials) ? item.serials : [])
          .map((s) => String(s).trim()).filter(Boolean))];
        if (lineSerials.length !== qty) {
          stockError = `"${item.name}" is serial-tracked — select exactly ${qty} serial number(s) (got ${lineSerials.length}).`;
          break;
        }
      }

      // ── Dropship lines skip the reserve loop entirely ────────────────────
      // Nothing is deducted (the vendor ships straight to the customer), so
      // nothing ever needs rolling back for these lines. The client's request
      // only counts if the Product itself is flagged isDropship — a client
      // flag alone can't exempt an ordinary item from stock accounting.
      if (item.wantsDropship && !isSerialTracked) {
        if (flags?.isDropship) {
          item.fulfillmentMode = 'dropship';
          item.reservedQty = 0;
          item.dropshipVendorId = flags.preferredVendorId || undefined;
          continue;
        }
        // Not actually dropship-eligible — fall through to a normal reserve.
      }

      let reservedViaInventory = false;
      if (branchId) {
        const invDoc = await Inventory.findOneAndUpdate(
          { productId: item.productId, branchId, tenantId: req.tenantId, quantity: { $gte: qty } },
          { $inc: { quantity: -qty }, $set: { lastUpdated: new Date() } },
          { new: true }
        );
        if (invDoc) {
          reservedViaInventory = true;
          // Keep Product.stock (the cross-branch mirror) in sync too, and
          // capture the resulting stock level for the low/out-of-stock
          // notification check below.
          const mirrored = await Product.findOneAndUpdate(
            { _id: item.productId, tenantId: req.tenantId },
            [{ $set: { stock: { $max: [0, { $subtract: [{ $ifNull: ['$stock', 0] }, qty] }] } } }],
            { new: true }
          );
          item.reservedQty = qty;
          reserved.push({ productId: item.productId, branchId, qty, viaInventory: true, name: item.name, finalStock: mirrored?.stock, reorderLevel: mirrored?.reorderLevel });
        }
      }

      if (!reservedViaInventory) {
        const prodDoc = await Product.findOneAndUpdate(
          { _id: item.productId, tenantId: req.tenantId, stock: { $gte: qty } },
          { $inc: { stock: -qty } },
          { new: true }
        );
        if (prodDoc) {
          item.reservedQty = qty;
          reserved.push({ productId: item.productId, qty, viaInventory: false, name: item.name, finalStock: prodDoc.stock, reorderLevel: prodDoc.reorderLevel });
        } else {
          // ── Backorder fallback ───────────────────────────────────────────
          // Only when BOTH the client asked for it on this line AND the
          // Product itself allows it (and the product isn't serial-tracked —
          // there are no on-hand units to name): reserve whatever is
          // available right now (same $gte-guarded atomic pattern, via
          // reserveUpTo — never a read-then-write) and record the shortfall
          // as backordered instead of rejecting the sale. Without the flags,
          // behavior is exactly what it always was: reject and roll back.
          if (item.wantsBackorder && flags?.allowBackorder && !isSerialTracked) {
            const partial = await reserveUpTo({
              tenantId: req.tenantId, productId: item.productId, branchId, qty,
            });
            if (partial.reservedQty > 0) {
              reserved.push({
                productId: item.productId, branchId, qty: partial.reservedQty,
                viaInventory: partial.viaInventory, name: item.name,
              });
            }
            item.fulfillmentMode = 'backorder';
            item.reservedQty = partial.reservedQty;
            item.backorderedQty = qty - partial.reservedQty;
            if (isBatchTracked && partial.reservedQty > 0) {
              item.batchesConsumed = await allocateBatchesFEFO(
                req.tenantId, item.productId, partial.reservedQty, consumedBatches);
            }
            continue;
          }
          const prod = await Product.findOne({ _id: item.productId, tenantId: req.tenantId }).select('name stock');
          stockError = `Insufficient stock for "${prod?.name || item.name || 'item'}". Available: ${prod?.stock || 0}, requested: ${qty}.`;
          break;
        }
      }

      // ── Consume the named serial units ─────────────────────────────────
      // Same conditional pattern as stock: the update only succeeds while
      // the serial is still 'in_stock', so two concurrent checkouts can't
      // both sell the same physical unit. The sale link is stamped after
      // the order document exists (the number isn't generated yet here).
      if (isSerialTracked) {
        let failedSerial = null;
        const taken = [];
        for (const s of lineSerials) {
          const doc = await SerialNumber.findOneAndUpdate(
            { tenantId: req.tenantId, productId: item.productId, serial: s, status: 'in_stock' },
            { $set: { status: 'sold', soldAt: new Date() } },
            { new: true }
          );
          if (!doc) { failedSerial = s; break; }
          taken.push(s);
        }
        if (taken.length) consumedSerials.push({ productId: item.productId, serials: taken });
        if (failedSerial) {
          stockError = `Serial "${failedSerial}" of "${item.name}" is not available (already sold, or not registered in stock).`;
          break;
        }
        item.serials = lineSerials;
      }

      // ── FEFO batch allocation (best-effort) ────────────────────────────
      // Consumes the soonest-expiring lots first via $gte-guarded updates.
      // Best-effort by design: stock that predates batch tracking belongs to
      // no batch, so a shortfall in batch coverage doesn't fail the sale —
      // the line just carries fewer batch links than units.
      if (isBatchTracked) {
        item.batchesConsumed = await allocateBatchesFEFO(req.tenantId, item.productId, qty, consumedBatches);
      }
    }

    if (stockError) {
      // Roll back every item already reserved for this attempt — stock,
      // consumed serials, and batch allocations alike.
      for (const r of reserved) {
        if (r.viaInventory) {
          await Inventory.findOneAndUpdate(
            { productId: r.productId, branchId: r.branchId, tenantId: req.tenantId },
            { $inc: { quantity: r.qty } }
          );
          await Product.findOneAndUpdate(
            { _id: r.productId, tenantId: req.tenantId },
            { $inc: { stock: r.qty } }
          );
        } else {
          await Product.findOneAndUpdate(
            { _id: r.productId, tenantId: req.tenantId },
            { $inc: { stock: r.qty } }
          );
        }
      }
      await rollbackTracking(req.tenantId, consumedSerials, consumedBatches);
      return res.status(400).json({ success: false, message: stockError });
    }

    // Generate a unique order number, scoped to this tenant — numbering used
    // to be counted globally across every tenant on the platform (a shared
    // bottleneck that got slower as the whole platform grew, not just this
    // tenant), even though orderNumber is now only unique per tenant.
    const count = await SalesOrder.countDocuments({ tenantId: req.tenantId });
    const lastOrder = await SalesOrder.findOne({ tenantId: req.tenantId }).sort('-createdAt').select('orderNumber');

    let nextNum = count + 1;
    if (lastOrder && lastOrder.orderNumber) {
      const parts = lastOrder.orderNumber.split('-');
      const lastStr = parts[2] || parts[parts.length - 1] || '0';
      const last = parseInt(lastStr, 10);
      if (!isNaN(last) && last >= nextNum) {
        nextNum = last + 1;
      }
    }

    // Fallback: If for any reason nextNum already exists, increment until a free orderNumber is found
    let orderNumber = `SO-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
    let exists = await SalesOrder.exists({ tenantId: req.tenantId, orderNumber });
    while (exists) {
      nextNum += 1;
      orderNumber = `SO-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
      exists = await SalesOrder.exists({ tenantId: req.tenantId, orderNumber });
    }

    // ─── Redeem store credit (optional) ──────────────────────────────────────
    // Applied after stock succeeds so a failed redemption only ever needs to
    // unwind stock, not stock+credit. Each note is consumed the same way
    // stock is reserved: a conditional $inc guarded by remainingAmount:{$gte},
    // never a separate read-then-write, so two concurrent checkouts spending
    // the same note can't both succeed past what it actually has left.
    let storeCreditApplied = 0;
    const creditRedemptions = [];
    const requestedCredit = Math.min(Math.max(Number(req.body.storeCreditApplied) || 0, 0), computedGrandTotal);
    if (requestedCredit > 0 && customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      let remaining = requestedCredit;
      const availableNotes = await CreditNote.find({
        tenantId: req.tenantId,
        customerId,
        status: { $in: ['open', 'partially_redeemed'] },
        remainingAmount: { $gt: 0 },
      }).sort('createdAt');

      for (const note of availableNotes) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, note.remainingAmount);
        const updated = await CreditNote.findOneAndUpdate(
          { _id: note._id, tenantId: req.tenantId, remainingAmount: { $gte: take } },
          {
            $inc: { remainingAmount: -take },
            $push: { redemptions: { salesOrderId: undefined, orderNumber, amount: take } },
          },
          { new: true }
        );
        if (!updated) continue; // lost a race to another checkout — try the next note
        updated.status = updated.remainingAmount > 0 ? 'partially_redeemed' : 'redeemed';
        await updated.save();
        creditRedemptions.push({ creditNoteId: note._id, creditNoteNumber: note.creditNoteNumber, amount: take });
        storeCreditApplied += take;
        remaining -= take;
      }

      if (storeCreditApplied > 0) {
        await Customer.findOneAndUpdate(
          { _id: customerId, tenantId: req.tenantId },
          { $inc: { storeCreditBalance: -storeCreditApplied } }
        );
      }
    }

    // ─── Build paymentDetails based on method ──────────────────────────────
    const pmtMethod = paymentMethod || 'Cash';
    const pmtDetails = paymentDetails || {};

    // Determine if this is a PENDING mobile money or instant payment
    const isMobileMoney = ['Airtel Money', 'MTN MoMo', 'MOBILE_MONEY', 'mobile_money'].includes(pmtMethod);
    const isPending = isMobileMoney && !transactionId; // No tx yet = still pending

    // Build sale record
    const saleData = {
      tenantId: req.tenantId,
      orderNumber,
      branchId,
      cashierId: req.user._id || req.user.id,
      customerId: (customerId && mongoose.Types.ObjectId.isValid(customerId)) ? customerId : undefined,
      customerName: customerName || '',
      items: normalizedItems,
      subtotal: computedSubtotal,
      totalDiscount: computedTotalDiscount,
      totalTax: computedItemTax,
      grandTotal: computedGrandTotal,
      paymentMethod: pmtMethod,
      paymentStatus: isPending ? 'PENDING' : 'COMPLETED',
      status: isPending ? 'pending' : 'completed',
      paymentDetails: {
        // CASH fields
        cashReceived: pmtDetails.cashReceived ? Number(pmtDetails.cashReceived) : undefined,
        changeReturned: pmtDetails.changeReturned ? Number(pmtDetails.changeReturned) : undefined,
        // CARD fields
        cardAuthCode: pmtDetails.cardAuthCode || transactionId || undefined,
        cardLast4: pmtDetails.cardLast4 || undefined,
        cardNetwork: pmtDetails.cardNetwork || undefined,
        // MOBILE MONEY fields
        momoProvider: pmtDetails.momoProvider || (pmtMethod === 'Airtel Money' ? 'AIRTEL' : pmtMethod === 'MTN MoMo' ? 'MTN' : undefined),
        momoPhoneNumber: pmtDetails.momoPhoneNumber || undefined,
        momoTransactionId: pmtDetails.momoTransactionId || transactionId || undefined,
        // CREDIT SALE fields — amountPaid is clamped to what the sale is
        // actually worth, and balanceDue is derived from it rather than
        // trusted from the client, so the two can't be manipulated to
        // under-report what a customer owes.
        amountPaid: isCreditSale ? Math.min(Math.max(Number(amountPaid) || 0, 0), computedGrandTotal) : undefined,
        balanceDue: isCreditSale ? computedGrandTotal - Math.min(Math.max(Number(amountPaid) || 0, 0), computedGrandTotal) : undefined,
        balanceDueDate: isCreditSale && balanceDueDate ? new Date(balanceDueDate) : undefined,
        storeCreditApplied: storeCreditApplied || undefined,
      },
      creditRedemptions,
      notes: notes || '',
      idempotencyKey: idempotencyKey || undefined,
    };

    // ── Fulfillment flags ───────────────────────────────────────────────────
    // An ordinary fully-in-stock walk-out sale keeps the default
    // 'not_required' and none of this block has any effect on it.
    const hasBackorder = normalizedItems.some((i) => Number(i.backorderedQty || 0) > 0);
    const hasDropship = normalizedItems.some((i) => i.fulfillmentMode === 'dropship');
    saleData.hasBackorder = hasBackorder;
    saleData.hasDropship = hasDropship;
    if (req.body.shippingAddress && typeof req.body.shippingAddress === 'object') {
      const { name, phone, address, city, notes: shipNotes } = req.body.shippingAddress;
      saleData.shippingAddress = { name, phone, address, city, notes: shipNotes };
    }
    if (hasBackorder || hasDropship || saleData.shippingAddress) {
      saleData.fulfillmentStatus = 'pending';
    }

    // ─── Split tender: attach the tender lines ──────────────────────────────
    // cashReceived reflects only the cash handed over; change comes out of
    // that cash (guaranteed by the validation above).
    if (isSplit) {
      const remainder = computedGrandTotal - storeCreditApplied;
      saleData.payments = splitPayments;
      saleData.paymentDetails.cashReceived = splitCashTender || undefined;
      saleData.paymentDetails.changeReturned = Math.max(0, splitTotal - remainder) || undefined;
      saleData.paymentStatus = 'COMPLETED';
      saleData.status = 'completed';
    }

    // Rolls back every atomic stock reservation made above (plus consumed
    // serials and batch allocations) — used whenever sale creation itself
    // fails, so a failed sale never leaves stock permanently deducted with
    // no order to account for it.
    const rollbackReservedStock = async () => {
      for (const r of reserved) {
        if (r.viaInventory) {
          await Inventory.findOneAndUpdate(
            { productId: r.productId, branchId: r.branchId, tenantId: req.tenantId },
            { $inc: { quantity: r.qty } }
          );
        }
        await Product.findOneAndUpdate(
          { _id: r.productId, tenantId: req.tenantId },
          { $inc: { stock: r.qty } }
        );
      }
      await rollbackTracking(req.tenantId, consumedSerials, consumedBatches);
    };

    // Mirror image of rollbackReservedStock, for the credit notes this
    // attempt spent — used alongside it whenever sale creation itself fails.
    const rollbackCreditRedemptions = async () => {
      for (const r of creditRedemptions) {
        await CreditNote.findOneAndUpdate(
          { _id: r.creditNoteId, tenantId: req.tenantId },
          { $inc: { remainingAmount: r.amount }, $set: { status: 'open' }, $pop: { redemptions: 1 } }
        );
      }
      if (storeCreditApplied > 0 && customerId) {
        await Customer.findOneAndUpdate(
          { _id: customerId, tenantId: req.tenantId },
          { $inc: { storeCreditBalance: storeCreditApplied } }
        );
      }
    };

    // Re-check split coverage now that the store-credit redemption actually
    // ran — a concurrent checkout may have spent some of the credit this
    // split was counting on.
    if (isSplit && splitTotal < computedGrandTotal - storeCreditApplied - 0.01) {
      await rollbackReservedStock();
      await rollbackCreditRedemptions();
      return res.status(400).json({
        success: false,
        message: 'The customer\'s store credit changed while paying — the split tenders no longer cover the total. Please re-enter the payment.',
      });
    }

    let sale;
    try {
      sale = await SalesOrder.create(saleData);
    } catch (createErr) {
      if (createErr.code === 11000 && (createErr.keyPattern?.idempotencyKey || createErr.message?.includes('idempotencyKey'))) {
        // Genuine duplicate submission under the same key — the stock this
        // attempt reserved is for a sale that already exists, so undo it and
        // return the original sale instead of double-counting the deduction.
        await rollbackReservedStock();
        await rollbackCreditRedemptions();
        const existing = await SalesOrder.findOne({ tenantId: req.tenantId, idempotencyKey })
          .populate('customerId', 'name phone')
          .populate('cashierId', 'name');
        if (existing) {
          console.log(`[IDEMPOTENCY DB INDEX] Duplicate sale blocked by DB index — key: ${idempotencyKey}`);
          return res.status(200).json({ success: true, data: existing, idempotent: true });
        }
      }
      await rollbackReservedStock();
      await rollbackCreditRedemptions();
      throw createErr;
    }

    // Stamp the sale link onto the serial units consumed above (they were
    // marked 'sold' before the order number existed).
    for (const entry of consumedSerials) {
      await SerialNumber.updateMany(
        { tenantId: req.tenantId, productId: entry.productId, serial: { $in: entry.serials }, status: 'sold' },
        { $set: { salesOrderId: sale._id, orderNumber } }
      );
    }

    // Fire low/out-of-stock notifications using the stock levels captured
    // during the atomic reservation above — no need to re-read them.
    for (const r of reserved) {
      if (r.finalStock === undefined || r.finalStock === null) continue;
      const reorder = r.reorderLevel || 10;
      if (r.finalStock === 0) {
        createNotification({
          tenantId: req.tenantId,
          type: 'out_of_stock',
          priority: 'critical',
          title: '🚨 Out of Stock',
          message: `"${r.name}" is now out of stock. Reorder immediately.`,
          actionUrl: '/inventory',
          refId: r.productId,
          refModel: 'Product',
        });
      } else if (r.finalStock <= reorder) {
        createNotification({
          tenantId: req.tenantId,
          type: 'low_stock',
          priority: 'high',
          title: '⚠️ Low Stock Alert',
          message: `"${r.name}" is running low — only ${r.finalStock} unit(s) left (reorder level: ${reorder}).`,
          actionUrl: '/inventory',
          refId: r.productId,
          refModel: 'Product',
        });
      }
      // Automation: workflows/webhooks listening for low stock (fires for
      // out-of-stock too — stock 0 is as low as it gets).
      if (r.finalStock <= reorder) {
        emitEvent(req.tenantId, 'inventory.low_stock', {
          product: { _id: r.productId, name: r.name, sku: r.sku, stock: r.finalStock, reorderLevel: reorder },
        });
      }
    }

    // Notify: new sale completed
    createNotification({
      tenantId: req.tenantId,
      type: 'new_sale',
      priority: 'low',
      title: '✅ Sale Completed',
      message: `Order ${saleData.orderNumber} — ${normalizedItems.length} item(s) — Total: ${computedGrandTotal.toLocaleString()} (${pmtMethod})`,
      actionUrl: '/sales',
      refId: sale._id,
      refModel: 'SalesOrder',
    });

    const populated = await SalesOrder.findById(sale._id)
      .populate('customerId', 'name phone')
      .populate('cashierId', 'name');

    // Automation: workflow rules & webhooks subscribed to completed sales.
    emitEvent(req.tenantId, 'sale.created', { sale: populated });

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'sale_created', entity: 'SalesOrder', entityId: sale._id,
      description: `Sale ${orderNumber} \u2014 ${computedGrandTotal.toLocaleString()} (${pmtMethod})`,
    });

    // ─── Update Customer Outstanding Credit ───────────────────────────────────
    if (isCreditSale && customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      await Customer.findOneAndUpdate(
        { _id: customerId, tenantId: req.tenantId },
        { $inc: { outstandingCredit: saleData.paymentDetails.balanceDue } }
      );
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error('Create sale error:', error);
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.code === 11000) {
      // Duplicate order number — retry with random suffix
      return res.status(409).json({ success: false, message: 'Order number conflict, please retry.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET ALL SALES ─────────────────────────────────────────────────────────────
exports.getSales = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 500;
    const skip  = (page - 1) * limit;

    const query = { tenantId: req.tenantId };
    if (req.query.branchId && mongoose.Types.ObjectId.isValid(req.query.branchId)) {
      query.branchId = req.query.branchId;
    }
    if (req.query.status) query.status = req.query.status;
    // Due bills: credit sales with money still owed.
    if (req.query.dueOnly === '1' || req.query.dueOnly === 'true') {
      query['paymentDetails.balanceDue'] = { $gt: 0 };
      if (!query.status) query.status = { $ne: 'voided' };
    }
    if (req.query.paymentMethod) query.paymentMethod = { $regex: req.query.paymentMethod, $options: 'i' };
    if (req.query.search) {
      query.$or = [
        { customerName: { $regex: req.query.search, $options: 'i' } },
        { orderNumber:  { $regex: req.query.search, $options: 'i' } },
      ];
    }

    // ── Role-based date restriction ────────────────────────────────────────────
    // cashier / branch_manager  → TODAY only (cannot see historical sales)
    // admin / manager / superadmin → full history (optionally filtered by query)
    const restrictedRoles = ['cashier', 'branch_manager'];
    const userRole = (req.user?.role || '').toLowerCase();

    if (restrictedRoles.includes(userRole)) {
      // Force today's window regardless of any frontend date params
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: todayStart, $lte: todayEnd };
    } else if (req.query.from || req.query.to) {
      // Admins can still filter by date range from query params
      query.createdAt = {};
      if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    const [total, sales] = await Promise.all([
      SalesOrder.countDocuments(query),
      SalesOrder.find(query)
        .populate('customerId', 'name phone')
        .populate('cashierId', 'name')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      success: true,
      data: sales,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET SINGLE SALE ───────────────────────────────────────────────────────────
exports.getSale = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const sale = await SalesOrder.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('customerId', 'name phone email')
      .populate('cashierId', 'name')
      .populate('branchId', 'name');

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found.' });
    }

    // Same today-only rule as getSales: a restricted role must not reach a
    // historical sale by navigating straight to its id.
    const restrictedRoles = ['cashier', 'branch_manager'];
    if (restrictedRoles.includes((req.user?.role || '').toLowerCase())) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (sale.createdAt < todayStart) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view sales made today.',
        });
      }
    }

    res.json({ success: true, data: sale });
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── VOID SALE ─────────────────────────────────────────────────────────────────
exports.voidSale = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const sale = await SalesOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: 'completed' },
      { status: 'voided' },
      { new: true }
    );

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found or already voided.' });
    }

    // Restore stock: undo the inventory deduction for the specific branch of
    // the sale. Only what was actually deducted comes back — a backordered
    // line only reserved reservedQty (the shortfall never left the ledger),
    // and a dropship line reserved nothing at all. Orders from before the
    // fulfillment feature have reservedQty null, which reads as the full
    // quantity (they were always fully reserved).
    const defaultB = await getDefaultBranch(req.tenantId);
    const targetBranchId = sale.branchId || (defaultB ? defaultB._id : null);
    const restoreOps = sale.items.map(async (item) => {
      const qty = item.reservedQty === null || item.reservedQty === undefined
        ? Number(item.quantity)
        : Number(item.reservedQty);
      if (qty <= 0) return;

      // Composite lines restore their components; ordinary lines restore
      // themselves (see stockOps.releaseForOrderItem).
      await releaseForOrderItem({
        tenantId: req.tenantId,
        branchId: targetBranchId,
        orderItem: item,
        qty,
      });

      // Voiding means "this sale shouldn't have happened" — the exact serial
      // units come back on the shelf, and batch quantities return to their
      // lots so the tracking ledgers stay in step with the restored stock.
      if (item.serials?.length) {
        await SerialNumber.updateMany(
          { tenantId: req.tenantId, productId: item.productId, serial: { $in: item.serials }, status: 'sold' },
          { $set: { status: 'in_stock' }, $unset: { soldAt: 1, salesOrderId: 1, orderNumber: 1 } }
        );
      }
      for (const take of item.batchesConsumed || []) {
        await Batch.findOneAndUpdate(
          { _id: take.batchId, tenantId: req.tenantId },
          { $inc: { quantity: Number(take.quantity) } }
        );
      }
    });

    await Promise.allSettled(restoreOps);

    // Restore any store credit this sale spent.
    if (sale.creditRedemptions?.length) {
      for (const r of sale.creditRedemptions) {
        const restored = await CreditNote.findOneAndUpdate(
          { _id: r.creditNoteId, tenantId: req.tenantId, status: { $ne: 'void' } },
          { $inc: { remainingAmount: r.amount } },
          { new: true }
        );
        if (restored) {
          restored.status = restored.remainingAmount >= restored.amount ? 'open' : 'partially_redeemed';
          await restored.save();
        }
      }
      const totalRedeemed = sale.creditRedemptions.reduce((sum, r) => sum + r.amount, 0);
      if (totalRedeemed > 0 && sale.customerId) {
        await Customer.findOneAndUpdate(
          { _id: sale.customerId, tenantId: req.tenantId },
          { $inc: { storeCreditBalance: totalRedeemed } }
        );
      }
    }

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'sale_voided', entity: 'SalesOrder', entityId: sale._id,
      description: `Voided ${sale.orderNumber} \u2014 ${(sale.grandTotal || 0).toLocaleString()}`,
    });

    // Automation: workflow rules & webhooks subscribed to voids.
    emitEvent(req.tenantId, 'sale.voided', { sale });

    res.json({ success: true, message: 'Sale voided and inventory restored.', data: sale });
  } catch (error) {
    console.error('Void sale error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CANCEL SALE LINES (partial, pending orders only) ──────────────────────
// Distinct from voidSale: applies to an order that never completed (e.g. a
// mobile-money sale awaiting confirmation), can cancel a subset of lines
// rather than the whole order, and is recorded as a Return doc (type:
// 'cancellation') for a single unified "adjustments" history instead of
// flipping the order straight to 'voided' the moment one line is touched.
exports.cancelSaleLines = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { lines, reason } = req.body; // lines: [{ productId, quantity }]
    if (!lines || lines.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one line item is required to cancel.' });
    }

    const sale = await SalesOrder.findOne({ _id: req.params.id, tenantId: req.tenantId, status: 'pending' });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Pending sale not found (already completed, voided, or cancelled?).' });
    }

    const cancelledItems = [];
    for (const line of lines) {
      const item = sale.items.find((si) => String(si.productId) === String(line.productId));
      if (!item) {
        return res.status(400).json({ success: false, message: `"${line.name || 'Item'}" is not part of this order.` });
      }
      const remaining = Number(item.quantity) - Number(item.cancelledQty || 0);
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0 || qty > remaining) {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel ${line.quantity} of "${item.name}" — only ${Math.max(0, remaining)} unit(s) remain on this order.`,
        });
      }
      cancelledItems.push({ item, qty });
    }

    // Release the reserved stock for each cancelled line, then record the
    // cancellation on the order item itself. The release is capped at what
    // this line actually still holds reserved — a backordered line only ever
    // deducted reservedQty (a dropship line deducted nothing), and earlier
    // partial cancellations already released their share, so cancelling can
    // never push more stock back than the sale took out.
    for (const { item, qty } of cancelledItems) {
      // The un-arrived backordered shortfall has no stock behind it, so it
      // absorbs the cancellation first; only the remainder releases stock,
      // capped at what this line still holds reserved.
      const shortfallCancel = Math.min(qty, Number(item.backorderedQty || 0));
      item.backorderedQty = Number(item.backorderedQty || 0) - shortfallCancel;

      const everReserved = item.reservedQty === null || item.reservedQty === undefined
        ? Number(item.quantity)
        : Number(item.reservedQty);
      const prevCancelled = Number(item.cancelledQty || 0);
      const stillReserved = Math.max(0, everReserved - prevCancelled);
      const releaseQty = Math.min(qty - shortfallCancel, stillReserved);
      if (releaseQty > 0) {
        // Composite lines release their components (releaseForOrderItem).
        await releaseForOrderItem({
          tenantId: req.tenantId,
          branchId: sale.branchId,
          orderItem: item,
          qty: releaseQty,
        });
        // Serial/batch ledgers are only unwound when this single call
        // cancels the line's entire reserved quantity — a partial cancel of
        // a tracked line keeps its serial/batch links intact (they still
        // describe the units the customer is keeping).
        if (prevCancelled === 0 && releaseQty === everReserved) {
          if (item.serials?.length) {
            await SerialNumber.updateMany(
              { tenantId: req.tenantId, productId: item.productId, serial: { $in: item.serials }, status: 'sold' },
              { $set: { status: 'in_stock' }, $unset: { soldAt: 1, salesOrderId: 1, orderNumber: 1 } }
            );
          }
          for (const take of item.batchesConsumed || []) {
            await Batch.findOneAndUpdate(
              { _id: take.batchId, tenantId: req.tenantId },
              { $inc: { quantity: Number(take.quantity) } }
            );
          }
        }
      }
      item.cancelledQty = Number(item.cancelledQty || 0) + qty;
    }
    sale.hasBackorder = sale.items.some((i) => Number(i.backorderedQty || 0) > 0);

    // If every line is now fully cancelled, the order itself is done.
    const allCancelled = sale.items.every((si) => Number(si.cancelledQty || 0) >= Number(si.quantity));
    if (allCancelled) {
      sale.status = 'voided';
    }
    await sale.save();

    // Same tenant-scoped numbering pattern as returnController.createReturn.
    const count = await Return.countDocuments({ tenantId: req.tenantId });
    const returnNumber = `RET-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const totalAmount = cancelledItems.reduce((sum, { item, qty }) => sum + Number(item.price) * qty, 0);

    const cancellationDoc = await Return.create({
      tenantId: req.tenantId,
      returnNumber,
      originalSaleId: sale._id,
      originalOrderNumber: sale.orderNumber,
      branchId: sale.branchId,
      processedBy: req.user._id,
      customerId: sale.customerId,
      customerName: sale.customerName,
      items: cancelledItems.map(({ item, qty }) => ({
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        quantity: qty,
        price: item.price,
        total: item.price * qty,
      })),
      totalAmount,
      reason: reason || 'Other',
      type: 'cancellation',
      status: 'completed',
      stockRestored: true,
      restoredAt: new Date(),
    });

    res.json({
      success: true,
      message: allCancelled ? 'Order fully cancelled.' : 'Selected items cancelled.',
      data: { sale, cancellation: cancellationDoc },
    });
  } catch (error) {
    console.error('Cancel sale lines error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── RECORD PAYMENT AGAINST A DUE BILL ────────────────────────────────────────
// Pays down the outstanding balance of a credit sale. The decrement is
// conditional on balanceDue >= amount, so a double-submit (or two cashiers
// collecting at once) can't overpay a bill or double-shrink the customer's
// outstanding credit.
exports.recordPayment = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be a positive number.' });
    }
    const allowed = ['Cash', 'Card', 'Airtel Money', 'MTN MoMo', 'Bank Transfer', 'Other'];
    const method = allowed.includes(req.body.method) ? req.body.method : 'Cash';

    const sale = await SalesOrder.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.tenantId,
        status: { $ne: 'voided' },
        'paymentDetails.balanceDue': { $gte: amount },
      },
      {
        $inc: { 'paymentDetails.balanceDue': -amount, 'paymentDetails.amountPaid': amount },
        $push: {
          payments: {
            method,
            amount,
            reference: req.body.reference ? String(req.body.reference).slice(0, 100) : undefined,
            receivedBy: req.user._id,
          },
        },
      },
      { new: true }
    );
    if (!sale) {
      return res.status(400).json({
        success: false,
        message: 'Bill not found, or the outstanding balance is smaller than that amount.',
      });
    }

    if (Number(sale.paymentDetails.balanceDue) <= 0.009) {
      sale.paymentStatus = 'paid';
      await sale.save();
    }

    // The customer's outstanding-credit total shrinks with the bill
    // (clamped at zero in case of historical drift).
    if (sale.customerId) {
      await Customer.findOneAndUpdate(
        { _id: sale.customerId, tenantId: req.tenantId },
        [{ $set: { outstandingCredit: { $max: [0, { $subtract: [{ $ifNull: ['$outstandingCredit', 0] }, amount] }] } } }]
      );
    }

    logActivity({
      tenantId: req.tenantId, userId: req.user._id,
      action: 'payment_recorded', entity: 'SalesOrder', entityId: sale._id,
      description: `Collected ${amount.toLocaleString()} (${method}) on ${sale.orderNumber}`,
    });

    // Automation: workflow rules & webhooks subscribed to due-bill payments.
    emitEvent(req.tenantId, 'sale.payment_received', { sale, payment: { amount, method } });

    res.json({
      success: true,
      message: Number(sale.paymentDetails.balanceDue) <= 0.009
        ? 'Bill fully settled.'
        : `Payment recorded — ${sale.paymentDetails.balanceDue.toLocaleString()} still due.`,
      data: sale,
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CONVERT SALES ORDER → PURCHASE ORDER ─────────────────────────────────────
// Manual conversion: pick lines off a sale and raise a vendor PO for them.
// The same shared service is what backorder replenishment and dropship POs
// use, so all three produce identically-linked POs.
exports.convertToPO = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { vendorId, lines, expectedDate, notes } = req.body;

    const sale = await SalesOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found.' });
    }
    if (sale.status === 'voided') {
      return res.status(400).json({ success: false, message: 'Cannot convert a voided sale.' });
    }

    const vendor = await Vendor.findOne({ _id: vendorId, tenantId: req.tenantId });
    if (!vendor) {
      return res.status(400).json({ success: false, message: 'Vendor not found.' });
    }

    const po = await createPOFromSalesLines({
      tenantId: req.tenantId,
      salesOrder: sale,
      lines,
      vendorId,
      sourceType: 'sales_order',
      expectedDate,
      notes: notes || `Converted from sales order ${sale.orderNumber}`,
    });

    res.status(201).json({ success: true, data: po });
  } catch (error) {
    console.error('Convert to PO error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ─── CREATE DROPSHIP PO(s) ────────────────────────────────────────────────────
// Groups the sale's dropship lines by vendor and raises one PO per vendor,
// shipped straight to the customer. Lines that already have a PO are skipped,
// so calling this twice can't double-order from the vendor.
exports.createDropshipPO = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const sale = await SalesOrder.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('customerId', 'name phone address');
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found.' });
    }
    if (sale.status === 'voided') {
      return res.status(400).json({ success: false, message: 'Cannot create a PO for a voided sale.' });
    }

    const openLines = sale.items.filter((i) =>
      i.fulfillmentMode === 'dropship' && !i.purchaseOrderId
      && (Number(i.quantity) - Number(i.cancelledQty || 0)) > 0);
    if (openLines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'This sale has no dropship lines awaiting a purchase order.',
      });
    }

    // Group by vendor. A line with no stamped vendor can be covered by an
    // explicit vendorId in the request body; otherwise it's an error the
    // caller has to resolve (set the product's preferred vendor first).
    const byVendor = new Map();
    for (const line of openLines) {
      const vendorId = line.dropshipVendorId || req.body.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: `"${line.name}" has no dropship vendor. Set the product's preferred vendor, or pass a vendorId.`,
        });
      }
      const key = String(vendorId);
      if (!byVendor.has(key)) byVendor.set(key, []);
      byVendor.get(key).push(line);
    }

    const shipToAddress = sale.shippingAddress?.address ? sale.shippingAddress : {
      name: sale.customerId?.name || sale.customerName || 'Customer',
      phone: sale.customerId?.phone || '',
      address: sale.customerId?.address || '',
    };

    const pos = [];
    for (const [vendorId, lines] of byVendor.entries()) {
      const vendor = await Vendor.findOne({ _id: vendorId, tenantId: req.tenantId });
      if (!vendor) {
        return res.status(400).json({ success: false, message: 'Dropship vendor not found.' });
      }
      const po = await createPOFromRefs({
        tenantId: req.tenantId,
        vendorId,
        refs: lines.map((item) => ({
          sale,
          item,
          quantity: Number(item.quantity) - Number(item.cancelledQty || 0),
        })),
        sourceType: 'dropship',
        dropshipCustomerId: sale.customerId?._id || sale.customerId || undefined,
        shipToAddress,
        expectedDate: vendor.leadTimeDays
          ? new Date(Date.now() + vendor.leadTimeDays * 24 * 60 * 60 * 1000)
          : undefined,
        notes: `Dropship for sales order ${sale.orderNumber}`,
      });
      pos.push(po);
    }

    res.status(201).json({ success: true, data: pos });
  } catch (error) {
    console.error('Create dropship PO error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ─── LIST OPEN BACKORDERS ─────────────────────────────────────────────────────
// Flattens every still-open backordered line across all sales into one list
// the Backorders page can render and bulk-convert into replenishment POs.
exports.getBackorders = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const sales = await SalesOrder.find({
      tenantId: req.tenantId,
      hasBackorder: true,
      status: { $ne: 'voided' },
    })
      .populate('customerId', 'name phone')
      .populate('items.productId', 'name sku preferredVendorId')
      .populate('items.purchaseOrderId', 'poNumber status')
      .sort('createdAt');

    const lines = [];
    for (const sale of sales) {
      for (const item of sale.items) {
        if (Number(item.backorderedQty || 0) <= 0) continue;
        lines.push({
          salesOrderId: sale._id,
          orderNumber: sale.orderNumber,
          orderDate: sale.createdAt,
          customerName: sale.customerName || sale.customerId?.name || 'Walk-in Customer',
          orderItemId: item._id,
          productId: item.productId?._id || item.productId,
          productName: item.name,
          sku: item.sku,
          backorderedQty: item.backorderedQty,
          reservedQty: item.reservedQty || 0,
          quantity: item.quantity,
          preferredVendorId: item.productId?.preferredVendorId || null,
          purchaseOrder: item.purchaseOrderId
            ? { _id: item.purchaseOrderId._id, poNumber: item.purchaseOrderId.poNumber, status: item.purchaseOrderId.status }
            : null,
        });
      }
    }

    res.json({ success: true, data: lines });
  } catch (error) {
    console.error('Get backorders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── REPLENISH BACKORDERS ─────────────────────────────────────────────────────
// Groups the selected (or all) open backordered lines that don't already have
// a replenishment PO by their product's preferred vendor, and raises one PO
// per vendor for the shortfall quantities. FIFO comes for free: receiving
// allocates arrived stock per PO line, and each PO line links to exactly one
// sales-order line.
exports.replenishBackorders = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const selected = req.body.lines; // optional: [{salesOrderId, orderItemId}]
    const fallbackVendorId = req.body.vendorId;

    const sales = await SalesOrder.find({
      tenantId: req.tenantId,
      hasBackorder: true,
      status: { $ne: 'voided' },
    }).sort('createdAt');

    const refs = []; // {sale, item, vendorId}
    for (const sale of sales) {
      for (const item of sale.items) {
        if (Number(item.backorderedQty || 0) <= 0) continue;
        if (item.purchaseOrderId) continue; // replenishment already ordered
        if (selected?.length) {
          const wanted = selected.some((s) =>
            String(s.salesOrderId) === String(sale._id) && String(s.orderItemId) === String(item._id));
          if (!wanted) continue;
        }
        const product = item.productId
          ? await Product.findOne({ _id: item.productId, tenantId: req.tenantId }).select('preferredVendorId')
          : null;
        const vendorId = product?.preferredVendorId || fallbackVendorId;
        if (!vendorId) {
          return res.status(400).json({
            success: false,
            message: `"${item.name}" has no preferred vendor. Set one on the product, or pass a vendorId to use for all unassigned lines.`,
          });
        }
        refs.push({ sale, item, vendorId: String(vendorId) });
      }
    }

    if (refs.length === 0) {
      return res.status(400).json({ success: false, message: 'No open backordered lines to replenish.' });
    }

    const byVendor = new Map();
    for (const ref of refs) {
      if (!byVendor.has(ref.vendorId)) byVendor.set(ref.vendorId, []);
      byVendor.get(ref.vendorId).push(ref);
    }

    const pos = [];
    for (const [vendorId, vendorRefs] of byVendor.entries()) {
      const vendor = await Vendor.findOne({ _id: vendorId, tenantId: req.tenantId });
      if (!vendor) {
        return res.status(400).json({ success: false, message: 'One of the preferred vendors no longer exists.' });
      }
      const po = await createPOFromRefs({
        tenantId: req.tenantId,
        vendorId,
        refs: vendorRefs.map((r) => ({
          sale: r.sale,
          item: r.item,
          quantity: Number(r.item.backorderedQty),
        })),
        sourceType: 'backorder',
        expectedDate: vendor.leadTimeDays
          ? new Date(Date.now() + vendor.leadTimeDays * 24 * 60 * 60 * 1000)
          : undefined,
        notes: `Backorder replenishment (${vendorRefs.length} line(s))`,
      });
      pos.push(po);
    }

    res.status(201).json({ success: true, data: pos });
  } catch (error) {
    console.error('Replenish backorders error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ─── DAILY SUMMARY ─────────────────────────────────────────────────────────────
exports.getDailySummary = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const sales = await SalesOrder.find({
      tenantId: req.tenantId,
      status: 'completed',
      createdAt: { $gte: today, $lt: tomorrow },
    });

    const summary = { todaySales: 0, orderCount: sales.length, cash: 0, card: 0, mobileMoney: 0 };
    sales.forEach(s => {
      summary.todaySales += s.grandTotal || 0;
      // Normalize to lowercase to handle 'Cash', 'cash', 'CASH' etc.
      const pmt = (s.paymentMethod || '').toLowerCase().replace(' ', '_');
      if (pmt === 'cash') summary.cash += s.grandTotal || 0;
      else if (pmt === 'card') summary.card += s.grandTotal || 0;
      else if (['mobile_money', 'airtel_money', 'mtn_momo', 'pesapal_uganda'].includes(pmt)) {
        summary.mobileMoney += s.grandTotal || 0;
      }
    });

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Daily summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
