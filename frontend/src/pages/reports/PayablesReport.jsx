import React, { useState, useEffect } from 'react';
import { FiRefreshCw, FiDownload, FiDollarSign } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ExtendedReportsAPI, PurchasesAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';

const PAY_METHODS = ['Bank Transfer', 'Cash', 'Card', 'Airtel Money', 'MTN MoMo', 'Other'];

// Aged payables: what the business still owes vendors on purchase orders,
// with vendor-payment recording inline.
const PayablesReport = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [paying, setPaying] = useState(null); // {po, vendorName}

  const fetchData = () => {
    setLoading(true);
    ExtendedReportsAPI.getPayables()
      .then(res => { if (res.data?.success) setData(res.data.data); })
      .catch(() => toast.error('Failed to load payables'))
      .finally(() => setLoading(false));
  };

  useEffect(fetchData, []);

  const exportCSV = () => {
    if (!data?.rows?.length) return toast.error('Nothing to export');
    const head = ['Vendor', 'Phone', 'Current', '1-30d', '31-60d', '61-90d', '90d+', 'Total'];
    const lines = data.rows.map(r => [r.vendorName, r.phone, r.current, r.d30, r.d60, r.d90, r.over90, r.total]);
    const csv = [head.join(','), ...lines.map(l => l.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'payables.csv'; a.click();
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading payables…</div>;
  if (!data) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <p style={{ color: '#64748B', fontSize: '13px', margin: 0, flex: 1, minWidth: '260px' }}>
          Money you owe vendors on purchase orders, aged by expected date. Record payments as you settle.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}><FiDownload /> CSV</button>
          <button className="btn btn-outline btn-sm" onClick={fetchData}><FiRefreshCw /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '18px' }}>
        {[
          ['Total Owed', data.totals.total, '#DC2626'],
          ['Current', data.totals.current, '#16A34A'],
          ['1–30 days', data.totals.d30, '#65A30D'],
          ['31–60 days', data.totals.d60, '#D97706'],
          ['61–90 days', data.totals.d90, '#EA580C'],
          ['Over 90 days', data.totals.over90, '#DC2626'],
        ].map(([label, val, color]) => (
          <div key={label} className="card" style={{ padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color }}>{formatCurrency(val)}</div>
          </div>
        ))}
      </div>

      {data.rows.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>🎉 No outstanding vendor bills.</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th style={{ textAlign: 'right' }}>Current</th>
                <th style={{ textAlign: 'right' }}>1–30d</th>
                <th style={{ textAlign: 'right' }}>31–60d</th>
                <th style={{ textAlign: 'right' }}>61–90d</th>
                <th style={{ textAlign: 'right' }}>90d+</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <React.Fragment key={i}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === i ? null : i)}>
                    <td><strong>{r.vendorName}</strong> <span style={{ color: '#94A3B8', fontSize: '11px' }}>{expanded === i ? '▲' : '▼'} {r.bills.length} PO(s)</span></td>
                    <td style={{ textAlign: 'right' }}>{r.current ? formatCurrency(r.current) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{r.d30 ? formatCurrency(r.d30) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{r.d60 ? formatCurrency(r.d60) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{r.d90 ? formatCurrency(r.d90) : '-'}</td>
                    <td style={{ textAlign: 'right', color: r.over90 ? '#DC2626' : 'inherit' }}>{r.over90 ? formatCurrency(r.over90) : '-'}</td>
                    <td style={{ textAlign: 'right' }}><strong>{formatCurrency(r.total)}</strong></td>
                  </tr>
                  {expanded === i && r.bills.map(b => (
                    <tr key={String(b.purchaseOrderId)} style={{ background: '#F8FAFC', fontSize: '13px' }}>
                      <td colSpan={5} style={{ paddingLeft: '32px' }}>
                        <strong>{b.poNumber}</strong>
                        <span style={{ color: '#64748B' }}> · total {formatCurrency(b.grandTotal)} · paid {formatCurrency(b.paidAmount)}</span>
                        {b.expectedDate && <span style={{ color: '#94A3B8' }}> · expected {new Date(b.expectedDate).toLocaleDateString()}</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(b.owed)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-primary btn-sm"
                          onClick={(e) => { e.stopPropagation(); setPaying({ po: b, vendorName: r.vendorName }); }}>
                          <FiDollarSign /> Pay
                        </button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paying && (
        <PayVendorModal
          po={paying.po}
          vendorName={paying.vendorName}
          onClose={() => setPaying(null)}
          onSuccess={() => { setPaying(null); fetchData(); }}
        />
      )}
    </div>
  );
};

const PayVendorModal = ({ po, vendorName, onClose, onSuccess }) => {
  const [amount, setAmount] = useState(String(po.owed));
  const [method, setMethod] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');
    if (amt > po.owed + 0.001) return toast.error(`Only ${formatCurrency(po.owed)} is owed on this PO`);
    setSaving(true);
    try {
      const res = await PurchasesAPI.recordPayment(po.purchaseOrderId, { amount: amt, method, reference: reference || undefined });
      if (res.data?.success) {
        toast.success(res.data.message || 'Payment recorded');
        onSuccess();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '400px', width: '100%', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Pay Vendor</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          {po.poNumber} — you owe {vendorName} <strong style={{ color: '#DC2626' }}>{formatCurrency(po.owed)}</strong>
        </p>
        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Amount *</label>
            <input className="form-input" type="number" min="0.01" max={po.owed} step="any" autoFocus
              style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Method</label>
              <select className="form-select" value={method} onChange={e => setMethod(e.target.value)}>
                {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reference</label>
              <input className="form-input" placeholder="Optional" value={reference}
                onChange={e => setReference(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayablesReport;
