import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiRefreshCw, FiDownload } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ExtendedReportsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';

// Aged receivables: outstanding credit-sale balances per customer.
const ReceivablesReport = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const fetchData = () => {
    setLoading(true);
    ExtendedReportsAPI.getReceivables()
      .then(res => { if (res.data?.success) setData(res.data.data); })
      .catch(() => toast.error('Failed to load receivables'))
      .finally(() => setLoading(false));
  };

  useEffect(fetchData, []);

  const exportCSV = () => {
    if (!data?.rows?.length) return toast.error('Nothing to export');
    const head = ['Customer', 'Phone', 'Current', '1-30d', '31-60d', '61-90d', '90d+', 'Total'];
    const lines = data.rows.map(r => [r.customerName, r.phone, r.current, r.d30, r.d60, r.d90, r.over90, r.total]);
    const csv = [head.join(','), ...lines.map(l => l.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'receivables.csv'; a.click();
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading receivables…</div>;
  if (!data) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <p style={{ color: '#64748B', fontSize: '13px', margin: 0, flex: 1, minWidth: '260px' }}>
          Money owed to you from credit sales, aged by due date. Collect from the <Link to="/due-bills">Due Bills</Link> page.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}><FiDownload /> CSV</button>
          <button className="btn btn-outline btn-sm" onClick={fetchData}><FiRefreshCw /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '18px' }}>
        {[
          ['Total Outstanding', data.totals.total, '#DC2626'],
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
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>🎉 Nothing outstanding — all credit sales are settled.</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
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
                    <td><strong>{r.customerName}</strong> {r.phone && <span style={{ color: '#64748B', fontSize: '12px' }}>({r.phone})</span>} <span style={{ color: '#94A3B8', fontSize: '11px' }}>{expanded === i ? '▲' : '▼'} {r.bills.length} bill(s)</span></td>
                    <td style={{ textAlign: 'right' }}>{r.current ? formatCurrency(r.current) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{r.d30 ? formatCurrency(r.d30) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{r.d60 ? formatCurrency(r.d60) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{r.d90 ? formatCurrency(r.d90) : '-'}</td>
                    <td style={{ textAlign: 'right', color: r.over90 ? '#DC2626' : 'inherit' }}>{r.over90 ? formatCurrency(r.over90) : '-'}</td>
                    <td style={{ textAlign: 'right' }}><strong>{formatCurrency(r.total)}</strong></td>
                  </tr>
                  {expanded === i && r.bills.map(b => (
                    <tr key={String(b.salesOrderId)} style={{ background: '#F8FAFC', fontSize: '13px' }}>
                      <td colSpan={6} style={{ paddingLeft: '32px' }}>
                        <Link to={`/sales/${b.salesOrderId}`}>{b.orderNumber}</Link>
                        {b.dueDate && <span style={{ color: '#64748B' }}> · due {new Date(b.dueDate).toLocaleDateString()}</span>}
                        <span style={{ color: '#94A3B8' }}> · sold {new Date(b.createdAt).toLocaleDateString()}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(b.balanceDue)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReceivablesReport;
