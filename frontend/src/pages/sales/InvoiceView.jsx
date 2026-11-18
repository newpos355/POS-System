import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiPrinter } from 'react-icons/fi';
import { SalesAPI, CustomizationAPI } from '../../services/api';
import { getCurrency } from '../../utils/currency';

const InvoiceView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sale, setSale] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [template, setTemplate] = React.useState(null);
  const cur = getCurrency();

  useEffect(() => {
    Promise.all([
      SalesAPI.getSale(id),
      // Tenant-designed invoice template (Customization → PDF Templates);
      // null means the built-in layout below renders with its defaults.
      CustomizationAPI.resolvePdfTemplate('invoice').catch(() => null),
    ])
      .then(([saleRes, tplRes]) => {
        if (saleRes.data?.data) setSale(saleRes.data.data);
        if (tplRes?.data?.data) setTemplate(tplRes.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading invoice...</div>;
  if (!sale)   return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Invoice not found</div>;

  // ── Currency formatting ────────────────────────────────────────────────────
  const fmt = (n) => `${cur.symbol} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // ── Payment / credit calculations ─────────────────────────────────────────
  const pmtMethod   = (sale.paymentMethod || 'Cash');
  const pmtLower    = pmtMethod.toLowerCase();
  const isCredit    = pmtLower.includes('credit') || pmtLower.includes('pay later');
  const pDetails    = sale.paymentDetails || {};
  const grandTotal  = Number(sale.grandTotal || sale.total || 0);
  // pDetails.amountPaid is a credit-sale-only field (defaults to 0 for every
  // other payment method) — for cash/card/mobile money what was actually
  // paid is cashReceived, or the full grandTotal when paid in one shot.
  const amountPaid  = isCredit
    ? Number(pDetails.amountPaid ?? 0)
    : Number(pDetails.cashReceived ?? sale.amountPaid ?? grandTotal);
  const balanceDue  = Number(pDetails.balanceDue  ?? sale.creditBalance ?? Math.max(0, grandTotal - amountPaid));
  const dueDateRaw  = pDetails.balanceDueDate || sale.creditDueDate;

  // ── Store info (from Settings → Receipt & Invoice) ────────────────────────
  const storeName    = localStorage.getItem('pos_business_name')    || 'POS Store';
  const storeAddress = localStorage.getItem('pos_business_address') || '';
  const storePhone   = localStorage.getItem('pos_business_phone')   || '';
  const storeTIN     = localStorage.getItem('pos_business_tin')     || '';

  // ── Template design (Customization → PDF Templates), with safe defaults ───
  const d = template?.design || {};
  const labels      = d.labels || {};
  const accent      = d.accentColor || '#16A34A';
  const textColor   = d.textColor || '#1E293B';
  const fontFamily  = d.fontFamily ? `${d.fontFamily}, sans-serif` : 'Arial, sans-serif';
  const paperWidth  = d.paperSize === 'thermal-80mm' ? '340px' : d.paperSize === 'letter' ? '816px' : '794px';
  const show = (key) => d[key] !== false; // undefined (no template) → show
  const footerText = (d.footerText !== undefined && d.footerText !== '')
    ? d.footerText
    : (localStorage.getItem('pos_invoice_footer') || 'Thank you for your business! Goods once sold are not returnable unless defective.');

  const handlePrint = () => window.print();

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '24px' }}>

      {/* Toolbar — hidden on print */}
      <div className="no-print" style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'center' }}>
        <button
          onClick={() => navigate(`/sales/${id}`)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', border: '1px solid #E2E8F0', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '14px' }}
        >
          <FiArrowLeft /> Back
        </button>
        <button
          onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#16A34A', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}
        >
          <FiPrinter /> Print / Save PDF
        </button>
      </div>

      {/* ── Invoice body ──────────────────────────────────────────────────── */}
      <div className="invoice-printable" style={{ maxWidth: paperWidth, margin: '0 auto', background: 'white', color: textColor, borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '48px', fontFamily }}>

        {d.headerText && (
          <div style={{ textAlign: 'center', fontSize: '12px', color: '#64748B', marginBottom: '18px' }}>{d.headerText}</div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
          <div>
            {show('showLogo') && d.logoUrl && (
              <img src={d.logoUrl} alt="logo" style={{ maxHeight: '56px', maxWidth: '180px', marginBottom: '10px', objectFit: 'contain' }} />
            )}
            <div style={{ fontSize: '28px', fontWeight: 800, color: accent, letterSpacing: '-1px' }}>{labels.documentTitle || 'INVOICE'}</div>
            <div style={{ color: '#64748B', marginTop: '4px', fontSize: '14px' }}>#{sale.orderNumber}</div>
          </div>
          {show('showBusinessInfo') && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>{storeName}</div>
              {storeAddress && <div style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>{storeAddress}</div>}
              {storePhone   && <div style={{ color: '#64748B', fontSize: '13px' }}>{storePhone}</div>}
              {storeTIN     && <div style={{ color: '#64748B', fontSize: '13px' }}>{storeTIN}</div>}
            </div>
          )}
        </div>

        {/* Meta: Bill To + Invoice Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '36px' }}>
          <div>
            {show('showCustomerInfo') && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{labels.billTo || 'Bill To'}</div>
                <div style={{ fontWeight: 600 }}>{sale.customerName || sale.customerId?.name || 'Walk-in Customer'}</div>
              </>
            )}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Invoice Details</div>
            <div style={{ fontSize: '13px' }}><strong>Date:</strong> {new Date(sale.createdAt).toLocaleDateString()}</div>
            {show('showCashier') && <div style={{ fontSize: '13px', marginTop: '4px' }}><strong>Cashier:</strong> {sale.cashierId?.name || '-'}</div>}
            {show('showPaymentInfo') && <div style={{ fontSize: '13px', marginTop: '4px' }}><strong>Payment:</strong> {pmtMethod}</div>}

            {/* Status badge — PAID or CREDIT SALE */}
            {isCredit ? (
              <div style={{ marginTop: '8px', display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ display: 'inline-block', padding: '4px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                  📋 CREDIT SALE
                </span>
                {balanceDue <= 0 && (
                  <span style={{ display: 'inline-block', padding: '4px 12px', background: '#F0FDF4', color: '#16A34A', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                    ✓ FULLY SETTLED
                  </span>
                )}
              </div>
            ) : (
              <div style={{ marginTop: '8px', display: 'inline-block', padding: '4px 12px', background: '#F0FDF4', color: '#16A34A', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                ✓ PAID
              </div>
            )}
          </div>
        </div>

        {/* Credit sale outstanding banner */}
        {isCredit && balanceDue > 0 && (
          <div style={{
            background: '#FEF2F2', border: '2px solid #FECACA', borderRadius: '10px',
            padding: '14px 20px', marginBottom: '28px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontWeight: 700, color: '#DC2626', fontSize: '15px' }}>⚠ Outstanding Balance</div>
              {dueDateRaw && (
                <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px' }}>
                  Due by: {new Date(dueDateRaw).toLocaleDateString('en-UG', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#DC2626' }}>{fmt(balanceDue)}</div>
          </div>
        )}

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left',    fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Item</th>
              <th style={{ padding: '12px 8px',  textAlign: 'center',  fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Qty</th>
              <th style={{ padding: '12px 8px',  textAlign: 'right',   fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Unit Price</th>
              <th style={{ padding: '12px 16px', textAlign: 'right',   fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items || []).map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ fontWeight: 600 }}>{item.product?.name || item.name}</div>
                  {show('showSku') && (item.product?.sku || item.sku) && (
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                      SKU: {item.product?.sku || item.sku}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 8px', textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ padding: '14px 8px', textAlign: 'right'  }}>{fmt(item.price)}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600 }}>{fmt(item.quantity * item.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '280px' }}>
            {/* Subtotal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', color: '#64748B' }}>
              <span>Subtotal</span>
              <span>{fmt(sale.subtotal || sale.total)}</span>
            </div>

            {/* Discount (only if > 0) */}
            {show('showDiscount') && Number(sale.totalDiscount || sale.discount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', color: accent }}>
                <span>Discount</span>
                <span>-{fmt(sale.totalDiscount || sale.discount)}</span>
              </div>
            )}

            {/* Tax (only if > 0) */}
            {show('showTax') && Number(sale.totalTax || sale.tax || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', color: '#64748B' }}>
                <span>Tax</span>
                <span>{fmt(sale.totalTax || sale.tax)}</span>
              </div>
            )}

            {/* Grand Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: '2px solid #E2E8F0', marginTop: '8px', fontSize: '18px', fontWeight: 800, color: accent }}>
              <span>{labels.totalLabel || 'TOTAL'}</span>
              <span>{fmt(grandTotal)}</span>
            </div>

            {/* Credit breakdown — only for credit sales */}
            {isCredit && (
              <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '12px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '14px' }}>
                  <span style={{ color: '#64748B' }}>Amount Paid</span>
                  <span style={{ color: '#16A34A', fontWeight: 600 }}>{fmt(amountPaid)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '16px', fontWeight: 800 }}>
                  <span style={{ color: '#DC2626' }}>Balance Due</span>
                  <span style={{ color: balanceDue > 0 ? '#DC2626' : '#16A34A' }}>{fmt(balanceDue)}</span>
                </div>
                {dueDateRaw && (
                  <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'right', marginTop: '4px' }}>
                    Due by: {new Date(dueDateRaw).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Signature lines (template-controlled) */}
        {d.showSignature && (
          <div style={{ marginTop: '48px', display: 'flex', justifyContent: 'space-between', gap: '40px' }}>
            <div style={{ flex: 1, borderTop: '1px solid #CBD5E1', paddingTop: '6px', fontSize: '11px', color: '#94A3B8' }}>Authorized Signature</div>
            <div style={{ flex: 1, borderTop: '1px solid #CBD5E1', paddingTop: '6px', fontSize: '11px', color: '#94A3B8' }}>Customer Signature</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #F1F5F9', marginTop: '40px', paddingTop: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
          {footerText}
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .invoice-printable, .invoice-printable * {
            visibility: visible !important;
          }
          .invoice-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            padding: 32px !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
          .no-print, header, nav, sidebar, aside, .app-header, .top-header, .navbar, .top-bar {
            display: none !important;
          }
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default InvoiceView;
