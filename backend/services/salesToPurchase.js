const PurchaseOrder = require('../models/PurchaseOrder');
const SalesOrder = require('../models/SalesOrder');
const Product = require('../models/Product');
const { nextDocNumber } = require('../utils/docNumber');
const { reserveUpTo } = require('../utils/stockOps');

// ─── The single shared path from sales-order lines to a purchase order ───────
// Used by all three PO-from-sale flows: manual SO→PO conversion
// (sourceType 'sales_order'), backorder replenishment ('backorder'), and
// dropship PO creation ('dropship'). Keeping one implementation means the
// numbering, source back-links, and SO line back-links can't drift apart
// between the three callers.
//
// refs: [{ sale, item, quantity, unitCost? }] — `item` is the actual
// subdocument on `sale.items`; unitCost falls back to the product's costPrice
// when not given. Replenishment passes refs spanning several sales orders;
// conversion and dropship pass refs from a single one.
async function createPOFromRefs({
  tenantId, vendorId, refs, sourceType, shipToAddress, dropshipCustomerId,
  expectedDate, notes, branchId, status = 'ordered',
}) {
  if (!vendorId) throw Object.assign(new Error('Vendor is required.'), { status: 400 });
  if (!refs || refs.length === 0) {
    throw Object.assign(new Error('At least one line is required.'), { status: 400 });
  }

  const poItems = [];
  for (const ref of refs) {
    const quantity = Number(ref.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw Object.assign(new Error(`Invalid quantity for "${ref.item.name}".`), { status: 400 });
    }

    let unitCost = Number(ref.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      const product = ref.item.productId
        ? await Product.findOne({ _id: ref.item.productId, tenantId }).select('costPrice')
        : null;
      unitCost = Number(product?.costPrice) || 0;
    }

    poItems.push({
      productId: ref.item.productId,
      name: ref.item.name,
      quantity,
      unitCost,
      total: quantity * unitCost,
      sourceSalesOrderId: ref.sale._id,
      sourceOrderItemId: ref.item._id,
    });
  }

  const poNumber = await nextDocNumber(PurchaseOrder, tenantId, 'PO', 'poNumber');
  const grandTotal = poItems.reduce((sum, i) => sum + i.total, 0);
  const sourceSalesOrderIds = [...new Set(refs.map((r) => String(r.sale._id)))];

  const po = await PurchaseOrder.create({
    tenantId,
    poNumber,
    vendorId,
    branchId: branchId || refs[0].sale.branchId,
    items: poItems,
    grandTotal,
    subtotal: grandTotal,
    status,
    sourceType,
    sourceSalesOrderIds,
    dropshipCustomerId: dropshipCustomerId || undefined,
    shipToAddress: shipToAddress || undefined,
    expectedDate: expectedDate ? new Date(expectedDate) : undefined,
    notes,
  });

  // Back-link each converted SO line to the PO that now covers it.
  for (const poItem of poItems) {
    await SalesOrder.updateOne(
      { _id: poItem.sourceSalesOrderId, tenantId, 'items._id': poItem.sourceOrderItemId },
      { $set: { 'items.$.purchaseOrderId': po._id } }
    );
  }

  return po;
}

// Single-sales-order convenience wrapper — resolves orderItemIds to the
// actual line subdocuments, then delegates to createPOFromRefs.
// lines: [{ orderItemId, quantity, unitCost? }]
async function createPOFromSalesLines({ salesOrder, lines, tenantId, ...rest }) {
  if (!lines || lines.length === 0) {
    throw Object.assign(new Error('At least one line is required.'), { status: 400 });
  }
  const refs = lines.map((line) => {
    const item = salesOrder.items.id(line.orderItemId);
    if (!item) {
      throw Object.assign(new Error('One of the selected lines is not part of this order.'), { status: 400 });
    }
    return { sale: salesOrder, item, quantity: line.quantity, unitCost: line.unitCost };
  });
  return createPOFromRefs({ tenantId, refs, ...rest });
}

// ─── Allocate newly-received PO stock to the waiting backordered SO lines ────
// Called from purchaseController.receiveItems after stock has been
// incremented, for POs whose lines link back to sales-order lines. For each
// received line, the still-backordered quantity is re-reserved out of stock
// via the same $gte-guarded atomic pattern used at checkout (reserveUpTo), so
// a concurrent walk-in sale of the same product can't be oversold — a losing
// race here simply leaves the line backordered for the next receipt.
async function allocateBackorders({ tenantId, po, receivedLines }) {
  const allocated = [];

  for (const recv of receivedLines) {
    const poItem = po.items.find((i) =>
      String(i.productId) === String(recv.productId) && i.sourceOrderItemId);
    if (!poItem || !poItem.sourceSalesOrderId) continue;

    const sale = await SalesOrder.findOne({ _id: poItem.sourceSalesOrderId, tenantId });
    if (!sale) continue;
    const line = sale.items.id(poItem.sourceOrderItemId);
    if (!line || Number(line.backorderedQty || 0) <= 0) continue;

    const want = Math.min(Number(line.backorderedQty), Number(recv.quantity));
    if (want <= 0) continue;

    const { reservedQty } = await reserveUpTo({
      tenantId,
      productId: line.productId,
      branchId: sale.branchId || po.branchId,
      qty: want,
    });
    if (reservedQty <= 0) continue;

    line.reservedQty = Number(line.reservedQty || 0) + reservedQty;
    line.backorderedQty = Number(line.backorderedQty) - reservedQty;
    if (line.backorderedQty <= 0) line.lineStatus = 'allocated';
    sale.hasBackorder = sale.items.some((i) => Number(i.backorderedQty || 0) > 0);
    recomputeFulfillmentStatus(sale);
    await sale.save();

    allocated.push({
      salesOrderId: sale._id,
      orderNumber: sale.orderNumber,
      productId: line.productId,
      name: line.name,
      quantity: reservedQty,
    });
  }

  return allocated;
}

// ─── Derive fulfillmentStatus from the current line quantities ───────────────
// Mutates (does not save) the sale. 'not_required' is only kept for orders
// that never entered the fulfillment pipeline at all.
function recomputeFulfillmentStatus(sale) {
  const inPipeline = sale.fulfillmentStatus !== 'not_required'
    || sale.hasBackorder || sale.hasDropship;
  if (!inPipeline) return;

  let due = 0;
  let shipped = 0;
  for (const item of sale.items) {
    const effective = Math.max(0,
      Number(item.quantity) - Number(item.cancelledQty || 0) - Number(item.returnedQty || 0));
    due += effective;
    shipped += Math.min(effective, Number(item.shippedQty || 0));
  }

  if (due <= 0) sale.fulfillmentStatus = 'cancelled';
  else if (shipped >= due) sale.fulfillmentStatus = 'fulfilled';
  else if (shipped > 0) sale.fulfillmentStatus = 'partially_fulfilled';
  else sale.fulfillmentStatus = 'pending';
}

module.exports = {
  createPOFromRefs,
  createPOFromSalesLines,
  allocateBackorders,
  recomputeFulfillmentStatus,
};
