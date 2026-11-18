// 4x6in shipping label, self-generated in-house (no carrier API exists in
// this deployment). The barcode is a REAL scannable CODE128 of the shipment
// number — rendered with jsbarcode onto an off-screen canvas and embedded as
// a data-URL <img>, the same technique BarcodeManager.jsx uses — not the
// decorative pipe-character "barcode" the thermal receipts fake.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const makeBarcodeDataUrl = async (value) => {
  try {
    const JsBarcode = (await import('jsbarcode')).default;
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value || 'NO-NUMBER', {
      format: 'CODE128', width: 2, height: 70, displayValue: true, fontSize: 16, margin: 8,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

// shipment: the populated shipment doc; pkg: one entry of shipment.packages.
export const printShippingLabel = async (shipment, pkg) => {
  const barcodeUrl = await makeBarcodeDataUrl(shipment.shipmentNumber);
  const from = shipment.branchId || {};
  const to = shipment.shipToAddress || {};
  const totalPkgs = (shipment.packages || []).length || 1;
  const itemsSummary = (pkg?.items || [])
    .map((i) => `${i.quantity}× ${i.name}`).join(', ');

  const html = `<!DOCTYPE html><html><head><title>Label ${esc(shipment.shipmentNumber)}</title>
  <style>
    @page { size: 4in 6in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; width: 4in; height: 6in; box-sizing: border-box; padding: 0.18in; display: flex; flex-direction: column; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; }
    .from { font-size: 9px; color: #333; max-width: 55%; }
    .from strong { font-size: 10px; }
    .meta { font-size: 9px; text-align: right; color: #333; }
    .divider { border-top: 2px solid #111; margin: 6px 0; }
    .to { flex: 1; }
    .to .lbl { font-size: 9px; text-transform: uppercase; color: #555; letter-spacing: 1px; }
    .to .name { font-size: 18px; font-weight: 800; margin: 2px 0; }
    .to .addr { font-size: 14px; line-height: 1.35; }
    .carrier { border: 2px solid #111; border-radius: 4px; padding: 5px 8px; margin: 6px 0; display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
    .items { font-size: 8.5px; color: #444; margin-top: 4px; max-height: 0.55in; overflow: hidden; }
    .barcode { text-align: center; margin-top: auto; }
    .barcode img { max-width: 100%; height: auto; }
    .order { text-align: center; font-size: 11px; font-weight: 700; margin-top: 2px; }
  </style></head><body>
    <div class="row">
      <div class="from">
        <strong>FROM: ${esc(from.name || 'Store')}</strong><br/>
        ${esc(from.address || '')}${from.city ? ', ' + esc(from.city) : ''}<br/>
        ${esc(from.phone || '')}
      </div>
      <div class="meta">
        ${new Date().toLocaleDateString()}<br/>
        Package <strong>${pkg?.packageNumber || 1} of ${totalPkgs}</strong><br/>
        ${pkg?.weightKg ? `Weight: ${pkg.weightKg} kg<br/>` : ''}
        ${pkg?.dimensions ? esc(pkg.dimensions) : ''}
      </div>
    </div>
    <div class="divider"></div>
    <div class="to">
      <div class="lbl">Ship To</div>
      <div class="name">${esc(to.name || 'Customer')}</div>
      <div class="addr">
        ${esc(to.address || '')}<br/>
        ${to.city ? esc(to.city) + '<br/>' : ''}
        ${to.phone ? 'Tel: ' + esc(to.phone) : ''}
      </div>
      ${itemsSummary ? `<div class="items">Contents: ${esc(itemsSummary)}</div>` : ''}
    </div>
    <div class="carrier">
      <span>${esc(shipment.carrier?.name || 'SELF DELIVERY')}</span>
      <span>${esc(shipment.carrier?.service || '')}</span>
      <span>${esc(shipment.carrier?.trackingNumber || '')}</span>
    </div>
    <div class="barcode">
      ${barcodeUrl ? `<img src="${barcodeUrl}" />` : `<div style="font-size:16px;font-weight:800">${esc(shipment.shipmentNumber)}</div>`}
    </div>
    <div class="order">Order ${esc(shipment.orderNumber || '')}</div>
    <script>window.onload = function() { window.print(); }</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return;
  w.document.write(html);
  w.document.close();
};
