/**
 * Thermal Receipt Printer Utility
 * Reads business info and currency from localStorage (set in Settings → Receipt & Invoice)
 */

const getStoreInfo = () => ({
  name:    localStorage.getItem('pos_business_name')    || 'My POS Store',
  address: localStorage.getItem('pos_business_address') || 'Kampala, Uganda',
  phone:   localStorage.getItem('pos_business_phone')   || '+256 700 000 000',
  tin:     localStorage.getItem('pos_business_tin')     || 'TIN: 1234567890',
  footer:  localStorage.getItem('pos_invoice_footer')   || 'Thank you for shopping with us!',
  footer2: 'Powered by POS Platform',
});

const getCur = () => {
  try { return JSON.parse(localStorage.getItem('pos_currency') || '{}'); } catch { return {}; }
};

const fmtMoney = (n) => {
  const cur = getCur();
  const sym = cur.symbol || 'UGX';
  return `${sym} ${Number(n || 0).toLocaleString()}`;
};

export function printThermalReceipt(order, settings = {}) {
  const store = { ...getStoreInfo(), ...settings };
  const template = localStorage.getItem('pos_receipt_template') || 'standard';
  const pmtMethod = (order.paymentMethod || 'CASH').toUpperCase();
  const pDetails = order.paymentDetails || {};

  const isCard = pmtMethod.includes('CARD');
  const isMobile = pmtMethod.includes('AIRTEL') || pmtMethod.includes('MTN') || pmtMethod.includes('MOBILE');
  const isCredit = pmtMethod.includes('CREDIT') || pmtMethod.includes('PAY LATER');

  const authCode = pDetails.cardAuthCode || order.authCode || 'APPROVED';
  const cardLast4 = pDetails.cardLast4 || order.cardLast4 || '****';
  const cardNetwork = pDetails.cardNetwork || order.cardNetwork || 'Visa/Mastercard';

  const momoProvider = pDetails.momoProvider || (pmtMethod.includes('AIRTEL') ? 'AIRTEL' : 'MTN');
  const momoPhone = pDetails.momoPhoneNumber || order.momoPhoneNumber || 'N/A';
  const momoTxnId = pDetails.momoTransactionId || order.transactionId || 'N/A';

  const cashRec   = !isCredit && !isCard && !isMobile
    ? (pDetails.cashReceived ?? order.cashReceived ?? order.total)
    : 0;
  const changeRet = !isCredit && !isCard && !isMobile
    ? (pDetails.changeReturned ?? order.change ?? 0)
    : 0;

  // Effective tax % for the label. Callers can't be trusted here: the POS
  // passes the live-cart percentage, which is already 0 by print time (the
  // cart is cleared on checkout), so a taxed sale printed "0% VAT" next to a
  // non-zero tax amount. Derive it from the order's own amounts instead.
  const taxableAmt = (Number(order.subtotal) || 0) - (Number(order.discount) || 0);
  const effTaxRate = Number(order.taxRate) > 0
    ? Number(order.taxRate)
    : (taxableAmt > 0 && Number(order.tax) > 0
        ? Math.round((Number(order.tax) / taxableAmt) * 1000) / 10
        : 0);

  const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt #${order.orderNumber}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 80mm;
      /* margin auto centers the 80mm column when the job lands on A4/PDF
         instead of real thermal paper; on an 80mm printer it's a no-op. */
      margin: 0 auto;
      padding: 4mm;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .xlarge { font-size: 20px; font-weight: 900; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .divider-solid { border-top: 2px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin: 4px 0; }
    .item-row { font-size: 11px; margin: 3px 0; }
    .approved-box {
      border: 2px solid #000;
      padding: 6px;
      margin: 8px 0;
      text-align: center;
      font-weight: bold;
      font-size: 13px;
    }
    .barcode { font-size: 8px; letter-spacing: 2px; text-align: center; margin: 6px 0; }
    @media print {
      body { padding: 2mm; }
    }
  </style>
</head>
<body>
  <!-- Store Header -->
  <div class="center">
    <div class="xlarge">${store.name}</div>
    <div style="margin-top:2px; font-size:11px;">${store.address}</div>
    <div style="font-size:11px;">Tel: ${store.phone}</div>
    <div style="font-size:11px;">${store.tin}</div>
  </div>

  <div class="divider-solid"></div>

  <!-- Receipt Info -->
  <div class="row"><span>Receipt #:</span><span class="bold">${order.orderNumber}</span></div>
  <div class="row"><span>Date:</span><span>${order.date}</span></div>
  <div class="row"><span>Cashier:</span><span>${order.cashierName || 'Cashier'}</span></div>
  <div class="row"><span>Customer:</span><span>${order.customerName || 'Walk-in Customer'}</span></div>

  <div class="divider"></div>

  <!-- Items Header -->
  <div style="font-size:10px; font-weight:bold;">
    <span>ITEM</span>
    <span style="float:right;">QTY &nbsp;&nbsp;&nbsp; AMOUNT</span>
  </div>
  <div class="divider"></div>

  <!-- Items -->
  ${(order.items || []).map((item, i) => `
    <div class="item-row">
      <div>${i + 1}. ${item.name}</div>
      <div class="row">
        <span style="font-size:10px; color:#555;">${fmtMoney(item.price)} x${item.qty}</span>
        <span class="bold">${fmtMoney(item.price * item.qty)}</span>
      </div>
    </div>
  `).join('')}

  <div class="divider"></div>
  <div class="row bold"><span>Total Items:</span><span>${(order.items || []).length} item${(order.items || []).length === 1 ? '' : 's'} / ${(order.items || []).reduce((s, it) => s + (Number(it.qty ?? it.quantity) || 0), 0)} pcs</span></div>

  <div class="divider"></div>

  <!-- Totals -->
  <div class="row"><span>Subtotal:</span><span>${fmtMoney(order.subtotal)}</span></div>
  ${order.discount > 0 ? `<div class="row"><span>Discount:</span><span>-${fmtMoney(order.discount)}</span></div>` : ''}
  <div class="row"><span>Tax (${effTaxRate}% VAT):</span><span>${fmtMoney(order.tax)}</span></div>

  <div class="divider-solid"></div>
  <div class="total-row">
    <span>${isCredit ? 'INVOICE TOTAL:' : 'TOTAL PAID:'}</span>
    <span>${fmtMoney(order.total)}</span>
  </div>
  ${isCredit && (pDetails.amountPaid !== undefined || pDetails.balanceDue !== undefined) ? `
    <div class="row" style="color:#16A34A; margin-top:2px;"><span>Amount Paid Now:</span><span class="bold">${fmtMoney(pDetails.amountPaid || 0)}</span></div>
    <div class="row" style="color:#DC2626; font-weight:bold;"><span>Balance Owed:</span><span>${fmtMoney(pDetails.balanceDue ?? (order.total - (pDetails.amountPaid || 0)))}</span></div>
  ` : ''}

  <div class="divider"></div>

  <!-- Payment Info Box -->
  <div class="approved-box">
    ${isCard ? `
      💳 CARD PAYMENT<br>
      <span style="font-size:11px; font-weight:normal;">Network: ${cardNetwork}</span><br>
      <span style="font-size:11px; font-weight:normal;">Card: **** **** **** ${cardLast4}</span><br>
      <span style="font-size:11px; font-weight:normal;">Auth Code: ${authCode}</span><br>
      ✅ PAYMENT APPROVED
    ` : isMobile ? `
      📱 MOBILE MONEY (${momoProvider})<br>
      <span style="font-size:11px; font-weight:normal;">Phone: ${momoPhone}</span><br>
      <span style="font-size:11px; font-weight:normal;">MOMO TXN ID: ${momoTxnId}</span><br>
      ✅ PAYMENT CONFIRMED
    ` : isCredit ? `
      📋 CREDIT / PAY LATER SALE<br>
      <span style="font-size:11px; font-weight:normal;">Paid Now: ${fmtMoney(pDetails.amountPaid || 0)}</span><br>
      <span style="font-size:11px; font-weight:bold; color:#DC2626;">Balance Due: ${fmtMoney(pDetails.balanceDue ?? (order.total - (pDetails.amountPaid || 0)))}</span><br>
      ${pDetails.balanceDueDate ? `<span style="font-size:10px; font-weight:normal;">Due By: ${new Date(pDetails.balanceDueDate).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' })}</span><br>` : ''}
      ✅ CREDIT SALE RECORDED
    ` : `
      💵 CASH PAYMENT<br>
      <span style="font-size:11px; font-weight:normal;">Amount Tendered: ${fmtMoney(cashRec)}</span><br>
      <span style="font-size:11px; font-weight:normal;">Change Given: ${fmtMoney(changeRet)}</span><br>
      ✅ TRANSACTION COMPLETE
    `}
  </div>

  <!-- Barcode-style Order Number -->
  <div class="barcode">
    ||||| ${order.orderNumber} |||||
    <div style="font-size:10px; letter-spacing:0px;">${order.orderNumber}</div>
  </div>

  <div class="divider"></div>

  <!-- Footer -->
  <div class="center" style="font-size:11px;">
    <div>${store.footer}</div>
    <div style="margin-top:4px; font-size:10px; color:#555;">${store.footer2} · ${typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev'}</div>
    <div style="margin-top:4px; font-size:10px;">Uganda Revenue Authority (URA)</div>
    <div style="font-size:10px;">VAT Registered Trader</div>
  </div>

  <!-- Merchant Copy -->
  <div class="divider" style="margin-top: 16px; border-style: dotted;"></div>
  <div class="center" style="font-size:10px; color:#555;">
    ✂ — MERCHANT COPY — ✂
  </div>
  <div class="divider" style="border-style: dotted;"></div>

  <div style="margin-top:8px;">
    <div class="row"><span>Receipt #:</span><span>${order.orderNumber}</span></div>
    <div class="row"><span>${isCredit ? 'Invoice Total:' : 'Total:'}</span><span class="bold">${fmtMoney(order.total)}</span></div>
    <div class="row"><span>Method:</span><span>${order.paymentMethod}</span></div>
    ${isCredit ? `
      <div class="row"><span>Paid Now:</span><span style="color:#16A34A; font-weight:bold;">${fmtMoney(pDetails.amountPaid || 0)}</span></div>
      <div class="row"><span>Balance Due:</span><span class="bold" style="color:#DC2626;">${fmtMoney(pDetails.balanceDue ?? (order.total - (pDetails.amountPaid || 0)))}</span></div>
    ` : ''}
    ${isCard ? `<div class="row"><span>Auth:</span><span>${authCode}</span></div>` : ''}
    ${isMobile ? `<div class="row"><span>Txn ID:</span><span>${momoTxnId.slice(0, 14)}</span></div>` : ''}
    <div class="row"><span>Date:</span><span>${order.date}</span></div>
  </div>

  <div class="divider" style="margin-top:12px; border-style: dotted;"></div>
  <div class="center" style="font-size:10px; color:#555; margin-bottom:8px;">
    Keep this receipt for your records
  </div>

  <script>
    window.onload = function() { window.print(); window.close(); }
  </script>
</body>
</html>`;

  printViaHiddenFrame(receiptHTML);
}

// Prints an HTML document through a hidden same-page iframe. Unlike
// window.open(), this is immune to popup blockers — which silently swallowed
// receipts before (window.open returned null and nothing happened, e.g. after
// clearing site data reset the popup permission). The document's own
// `window.onload → window.print()` script triggers the dialog; window.close()
// inside an iframe is a harmless no-op.
function printViaHiddenFrame(html) {
  try {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    // Keep the frame alive long enough for the print dialog/spooler, then
    // clean it up so repeated prints don't accumulate frames.
    setTimeout(() => { try { frame.remove(); } catch {} }, 60000);
  } catch (e) {
    // Fallback: the old popup route, but now loud when blocked.
    const printWindow = window.open('', '_blank', 'width=340,height=600,scrollbars=no');
    if (!printWindow) {
      alert('Printing is blocked. Please allow pop-ups for this site (padlock icon → Site settings → Pop-ups → Allow), then try again.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

export function quickPrintReceipt(order) {
  printThermalReceipt(order);
}

/**
 * Opens a USB cash drawer connected to the thermal printer.
 * Sends a silent 1x1 print job — ESC/POS printers interpret this as a drawer kick.
 */
export function openCashDrawer() {
  printViaHiddenFrame(`<!DOCTYPE html><html><head><style>@page{size:1mm 1mm;margin:0}body{visibility:hidden}</style></head><body><script>window.onload=function(){window.print();setTimeout(function(){window.close();},400)}<\/script></body></html>`);
}
