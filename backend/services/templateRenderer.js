// Renders {{placeholder}} templates (email subjects/bodies, notification
// text) against an event context, and builds those contexts from business
// documents. Values are HTML-escaped on insertion except for the block
// placeholders listed in RAW_KEYS (pre-built trusted HTML like the items
// table), so tenant data can never inject markup into an email.

const escapeHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Placeholders whose values are engine-generated HTML, inserted verbatim.
const RAW_KEYS = new Set(['items_table']);

// Dot-path getter: get(ctx, 'order.total') → ctx.order.total.
const getPath = (obj, path) =>
  String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// ─── Render a template string against a context ──────────────────────────────
// Unknown placeholders render as an empty string rather than leaking the
// raw {{tag}} into a customer-facing email. `html: false` skips escaping for
// plain-text targets (email subjects, notification text, field values).
const render = (template, context, { html = true } = {}) =>
  String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = getPath(context, key);
    if (value === undefined || value === null) return '';
    if (RAW_KEYS.has(key)) return html ? String(value) : '';
    const str = value instanceof Date ? value.toLocaleString()
      : typeof value === 'number' ? value.toLocaleString()
      : String(value);
    return html ? escapeHtml(str) : str;
  });

// ─── Items table block (for sale-related emails) ─────────────────────────────
const buildItemsTable = (items = []) => {
  const cell = (v, right) =>
    `<td style="padding:6px 10px;border:1px solid #E2E8F0;${right ? 'text-align:right;' : ''}">${escapeHtml(typeof v === 'number' ? v.toLocaleString() : v)}</td>`;
  const rows = items
    .map((it) => `<tr>${cell(it.name || '')}${cell(it.quantity || 0, true)}${cell(it.price || 0, true)}${cell(it.total ?? (it.quantity || 0) * (it.price || 0), true)}</tr>`)
    .join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead><tr>
      <th style="padding:6px 10px;border:1px solid #E2E8F0;background:#F8FAFC;text-align:left;">Item</th>
      <th style="padding:6px 10px;border:1px solid #E2E8F0;background:#F8FAFC;text-align:right;">Qty</th>
      <th style="padding:6px 10px;border:1px solid #E2E8F0;background:#F8FAFC;text-align:right;">Price</th>
      <th style="padding:6px 10px;border:1px solid #E2E8F0;background:#F8FAFC;text-align:right;">Total</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
};

// ─── Build the context an event exposes to conditions & placeholders ─────────
// `data` is the payload passed to emitEvent (documents keyed by role, e.g.
// {sale, customer}); `tenant` is the tenant doc for business info. The same
// shapes are documented in automationEngine.EVENT_CATALOG for the UI.
const buildContext = (event, data = {}, tenant = null) => {
  const ctx = {
    event,
    business: {
      name: tenant?.name || '',
      email: tenant?.email || '',
      phone: tenant?.phone || '',
    },
    date: new Date().toLocaleString(),
  };

  const sale = data.sale;
  if (sale) {
    ctx.order = {
      number: sale.orderNumber,
      subtotal: sale.subtotal || 0,
      discount: sale.totalDiscount || 0,
      tax: sale.totalTax || 0,
      total: sale.grandTotal || 0,
      paymentMethod: sale.paymentMethod || '',
      paymentStatus: sale.paymentStatus || '',
      status: sale.status || '',
      itemCount: (sale.items || []).length,
      notes: sale.notes || '',
      date: sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '',
      balanceDue: sale.paymentDetails?.balanceDue || 0,
    };
    ctx.items_table = buildItemsTable(sale.items);
    const cust = data.customer || (typeof sale.customerId === 'object' ? sale.customerId : null);
    ctx.customer = {
      name: cust?.name || sale.customerName || 'Walk-in Customer',
      email: cust?.email || '',
      phone: cust?.phone || '',
    };
    ctx.cashier = { name: (typeof sale.cashierId === 'object' && sale.cashierId?.name) || '' };
  }

  if (data.customer && !sale) {
    ctx.customer = {
      name: data.customer.name || '',
      email: data.customer.email || '',
      phone: data.customer.phone || '',
      address: data.customer.address || '',
      outstandingCredit: data.customer.outstandingCredit || 0,
    };
  }

  if (data.product) {
    ctx.product = {
      name: data.product.name || '',
      sku: data.product.sku || '',
      price: data.product.price || 0,
      stock: data.product.stock ?? 0,
      reorderLevel: data.product.reorderLevel ?? 0,
    };
  }

  if (data.purchase) {
    ctx.purchase = {
      number: data.purchase.poNumber || data.purchase.orderNumber || '',
      total: data.purchase.grandTotal || data.purchase.total || 0,
      status: data.purchase.status || '',
      vendorName: (typeof data.purchase.vendorId === 'object' && data.purchase.vendorId?.name) || data.purchase.vendorName || '',
    };
  }

  if (data.return) {
    ctx.return = {
      number: data.return.returnNumber || '',
      total: data.return.totalRefund || data.return.total || 0,
      reason: data.return.reason || '',
    };
  }

  if (data.payment) {
    ctx.payment = {
      amount: data.payment.amount || 0,
      method: data.payment.method || '',
    };
  }

  return ctx;
};

module.exports = { render, buildContext, buildItemsTable, escapeHtml };
