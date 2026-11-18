// Print helpers for fulfillment documents — same window.open/document.write/
// auto-print pattern as pages/pos/thermalPrint.js, but on ordinary paper
// sizes (A4) instead of thermal rolls.

const openAndPrint = (html, { width = 900, height = 700 } = {}) => {
  const w = window.open('', '_blank', `width=${width},height=${height}`);
  if (!w) return;
  w.document.write(html);
  w.document.close();
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── PICK SHEET ──────────────────────────────────────────────────────────────
export const printPicklist = (picklist) => {
  const rows = (picklist.items || []).map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(item.name)}</strong></td>
      <td>${esc(item.sku || '-')}</td>
      <td>${esc(item.barcode || '-')}</td>
      <td style="text-align:center;font-size:16px;font-weight:700">${item.requestedQty}</td>
      <td style="text-align:center">${item.pickedQty || ''}</td>
      <td style="width:60px;border-bottom:1px solid #999"></td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><title>${esc(picklist.picklistNumber)}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: Arial, sans-serif; color: #111; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; }
    .sign { margin-top: 40px; display: flex; gap: 60px; font-size: 13px; }
    .sign div { border-top: 1px solid #333; padding-top: 6px; width: 200px; }
  </style></head><body>
    <h1>Pick Sheet — ${esc(picklist.picklistNumber)}</h1>
    <div class="meta">
      Order(s): <strong>${esc((picklist.orderNumbers || []).join(', ') || '-')}</strong>
      &nbsp;·&nbsp; Created: ${new Date(picklist.createdAt).toLocaleString()}
      ${picklist.assignedTo?.name ? `&nbsp;·&nbsp; Assigned to: <strong>${esc(picklist.assignedTo.name)}</strong>` : ''}
    </div>
    <table>
      <thead><tr>
        <th>#</th><th>Item</th><th>SKU</th><th>Barcode</th>
        <th style="text-align:center">Qty to Pick</th><th style="text-align:center">Picked</th><th>✓</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sign"><div>Picked by / date</div><div>Checked by / date</div></div>
    <script>window.onload = function() { window.print(); }</script>
  </body></html>`;

  openAndPrint(html);
};

// ─── WAYBILL (A4) ────────────────────────────────────────────────────────────
// qrDataUrl is optional — when the qrcode lib produced one it's embedded in
// the header; the document is complete without it.
export const printWaybill = (waybill, { currencyFormat = (n) => n, qrDataUrl = null } = {}) => {
  const goodsRows = (waybill.goods || []).map((g, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(g.description)}</td>
      <td style="text-align:center">${g.quantity} ${esc(g.unit || '')}</td>
      <td style="text-align:right">${currencyFormat(g.taxableValue || 0)}</td>
      <td style="text-align:right">${currencyFormat(g.taxAmount || 0)}</td>
      <td style="text-align:right">${currencyFormat((g.taxableValue || 0) + (g.taxAmount || 0))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><title>${esc(waybill.waybillNumber)}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 13px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin: 0; letter-spacing: 1px; }
    .num { font-size: 15px; font-weight: 700; margin-top: 6px; }
    .disclaimer { font-size: 10px; color: #777; margin-top: 4px; max-width: 380px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .box { border: 1px solid #bbb; border-radius: 6px; padding: 10px 12px; }
    .box h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; color: #555; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #ccc; padding: 7px 9px; text-align: left; }
    th { background: #f1f5f9; font-size: 12px; }
    .total-row td { font-weight: 700; background: #f8fafc; }
    .cancel-stamp { position: fixed; top: 40%; left: 15%; font-size: 70px; color: rgba(220,38,38,0.25); transform: rotate(-25deg); font-weight: 900; letter-spacing: 6px; }
    .sign { margin-top: 46px; display: flex; gap: 60px; }
    .sign div { border-top: 1px solid #333; padding-top: 6px; width: 220px; }
  </style></head><body>
    ${waybill.status === 'cancelled' ? '<div class="cancel-stamp">CANCELLED</div>' : ''}
    <div class="head">
      <div>
        <h1>WAYBILL</h1>
        <div class="num">${esc(waybill.waybillNumber)}</div>
        <div class="disclaimer">Internal transport document issued by the consignor. Not a government e-way-bill or tax-portal filing.</div>
      </div>
      <div style="text-align:right">
        ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:96px;height:96px" />` : ''}
        <div style="font-size:12px;color:#555;margin-top:4px">${new Date(waybill.createdAt || Date.now()).toLocaleString()}</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <h3>Consignor (From)</h3>
        <strong>${esc(waybill.consignor?.name || '-')}</strong><br/>
        ${esc(waybill.consignor?.address || '')}<br/>
        ${esc(waybill.consignor?.phone || '')}
      </div>
      <div class="box">
        <h3>Consignee (To)</h3>
        <strong>${esc(waybill.consignee?.name || '-')}</strong><br/>
        ${esc(waybill.consignee?.address || '')}<br/>
        ${esc(waybill.consignee?.phone || '')}
      </div>
      <div class="box">
        <h3>Transporter</h3>
        <strong>${esc(waybill.transporter?.name || '-')}</strong><br/>
        Vehicle: ${esc(waybill.transporter?.vehicleNumber || '-')} · Mode: ${esc(waybill.transporter?.mode || 'road')}<br/>
        ${esc(waybill.transporter?.contactPhone || '')}
      </div>
      <div class="box">
        <h3>Document</h3>
        Type: <strong style="text-transform:capitalize">${esc(waybill.documentType || 'sale')}</strong><br/>
        ${waybill.distanceKm ? `Distance: ${waybill.distanceKm} km<br/>` : ''}
        Status: <strong style="text-transform:capitalize">${esc(waybill.status)}</strong>
      </div>
    </div>

    <table>
      <thead><tr>
        <th>#</th><th>Description of Goods</th><th style="text-align:center">Qty</th>
        <th style="text-align:right">Taxable Value</th><th style="text-align:right">Tax</th><th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>
        ${goodsRows}
        <tr class="total-row">
          <td colspan="5" style="text-align:right">Total Value</td>
          <td style="text-align:right">${currencyFormat(waybill.totalValue || 0)}</td>
        </tr>
      </tbody>
    </table>

    <div class="sign"><div>Consignor signature</div><div>Driver signature</div></div>
    <script>window.onload = function() { window.print(); }</script>
  </body></html>`;

  openAndPrint(html);
};
