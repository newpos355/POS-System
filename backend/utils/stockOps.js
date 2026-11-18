const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Batch = require('../models/Batch');

// Atomic, conditional stock release — the mirror image of the reserve pattern
// in salesController.createSale. A plain $inc is safe here (unlike reserving,
// releasing can never go negative or overshoot), but every caller (void,
// return approval, cancellation) MUST go through this one function so stock
// bookkeeping only has one implementation instead of five near-identical
// copies that could drift out of sync.
async function releaseAtomic({ tenantId, productId, branchId, qty }) {
  if (!productId || !qty) return;
  if (branchId) {
    await Inventory.findOneAndUpdate(
      { productId, branchId, tenantId },
      { $inc: { quantity: qty }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
  }
  await Product.findOneAndUpdate(
    { _id: productId, tenantId },
    { $inc: { stock: qty } }
  );
}

// Atomic, conditional full-quantity reserve — same pattern already proven in
// salesController.createSale's checkout loop. Prefers the branch-level
// Inventory record when one exists, falls back to Product.stock. Returns
// {ok:true} on success, {ok:false} if not enough stock exists right now.
async function reserveAtomic({ tenantId, productId, branchId, qty }) {
  if (branchId) {
    const invDoc = await Inventory.findOneAndUpdate(
      { productId, branchId, tenantId, quantity: { $gte: qty } },
      { $inc: { quantity: -qty }, $set: { lastUpdated: new Date() } },
      { new: true }
    );
    if (invDoc) {
      const mirrored = await Product.findOneAndUpdate(
        { _id: productId, tenantId },
        [{ $set: { stock: { $max: [0, { $subtract: [{ $ifNull: ['$stock', 0] }, qty] }] } } }],
        { new: true }
      );
      return { ok: true, viaInventory: true, finalStock: mirrored?.stock };
    }
  }

  const prodDoc = await Product.findOneAndUpdate(
    { _id: productId, tenantId, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
    { new: true }
  );
  if (prodDoc) return { ok: true, viaInventory: false, finalStock: prodDoc.stock };
  return { ok: false };
}

// Partial reserve for backorders: takes whatever is currently available (down
// to 0) via the same $gte-guarded conditional update used everywhere else —
// never a separate read-then-write, so a losing race against a concurrent
// sale just reserves less (and backorders more) instead of overselling.
async function reserveUpTo({ tenantId, productId, branchId, qty, maxAttempts = 3 }) {
  let remaining = qty;
  let reservedQty = 0;
  let viaInventory = false;

  for (let attempt = 0; attempt < maxAttempts && remaining > 0; attempt++) {
    const available = branchId
      ? (await Inventory.findOne({ productId, branchId, tenantId }))?.quantity
      : undefined;
    const fallbackAvailable = available === undefined
      ? (await Product.findOne({ tenantId, _id: productId }))?.stock || 0
      : available;
    const take = Math.min(remaining, Math.max(0, fallbackAvailable));
    if (take <= 0) break;

    const result = await reserveAtomic({ tenantId, productId, branchId, qty: take });
    if (result.ok) {
      reservedQty += take;
      remaining -= take;
      viaInventory = result.viaInventory;
    }
    // On a miss (someone else reserved it first), loop and re-read the
    // now-current available quantity rather than retrying the same `take`.
  }

  return { reservedQty, shortQty: qty - reservedQty, viaInventory };
}

// Composite-aware release for N units of a sales-order line. A composite
// (bundle) line never deducted its own product's stock at sale time — it
// deducted each component's — so restoring it must put back the COMPONENTS
// (qtyPerUnit × qty each), never the bundle product itself. Ordinary lines
// fall through to a plain releaseAtomic. Callers: void, cancel, returns.
async function releaseForOrderItem({ tenantId, branchId, orderItem, qty }) {
  if (!qty || qty <= 0) return;
  if (orderItem?.componentsConsumed?.length) {
    for (const comp of orderItem.componentsConsumed) {
      if (!comp.productId) continue;
      await releaseAtomic({
        tenantId,
        productId: comp.productId,
        branchId,
        qty: Number(comp.qtyPerUnit) * qty,
      });
    }
    return;
  }
  await releaseAtomic({ tenantId, productId: orderItem.productId, branchId, qty });
}

// FEFO (first expiry, first out) batch consumption for a batch-tracked
// product. Lots with no expiry date sort LAST — dated stock should leave the
// shelf before undated stock. Every decrement is $gte-guarded; a lost race
// just moves on to the next lot. Takes are appended to `rollbackList` (when
// given) so a failed operation can put them back. Best-effort by design:
// stock that predates batch tracking belongs to no lot, so a coverage
// shortfall never fails the caller — it just returns fewer allocations.
async function allocateBatchesFEFO(tenantId, productId, qty, rollbackList) {
  const allocs = [];
  let remaining = qty;
  const batches = await Batch.find({ tenantId, productId, quantity: { $gt: 0 } });
  batches.sort((a, b) => {
    const ax = a.expiryDate ? a.expiryDate.getTime() : Infinity;
    const bx = b.expiryDate ? b.expiryDate.getTime() : Infinity;
    return ax - bx || a.createdAt - b.createdAt;
  });
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(b.quantity));
    const upd = await Batch.findOneAndUpdate(
      { _id: b._id, tenantId, quantity: { $gte: take } },
      { $inc: { quantity: -take } },
      { new: true }
    );
    if (!upd) continue;
    allocs.push({ batchId: b._id, batchNumber: b.batchNumber, quantity: take });
    if (rollbackList) rollbackList.push({ batchId: b._id, quantity: take });
    remaining -= take;
  }
  return allocs;
}

module.exports = {
  releaseAtomic, reserveAtomic, reserveUpTo, releaseForOrderItem, allocateBatchesFEFO,
};
