import React, { useState, useEffect } from 'react';
import { FiPrinter, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { SalesAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { printSaleReceipt } from './printSale';

// Reprint any recent bill without leaving the POS. Uses the same receipt
// mapping as the sale-detail print button.
const ReprintModal = ({ onClose }) => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    SalesAPI.getSales({ limit: 25 })
      .then(res => { if (res.data?.success) setSales(res.data.data || []); })
      .catch(() => toast.error('Failed to load recent sales'))
      .finally(() => setLoading(false));
  }, []);

  const visible = sales.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.orderNumber || '').toLowerCase().includes(q)
      || (s.customerName || '').toLowerCase().includes(q);
  });

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '520px', width: '100%', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '12px' }}>Reprint Bill</h2>
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
          <input className="form-input" style={{ paddingLeft: '36px' }} placeholder="Search order # or customer…"
            value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>No matching sales.</div>
        ) : (
          visible.map(sale => (
            <div key={sale._id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: '10px', marginBottom: '6px', opacity: sale.status === 'voided' ? 0.5 : 1 }}>
              <div style={{ flex: 1 }}>
                <strong>{sale.orderNumber}</strong>
                {sale.status === 'voided' && <span className="badge badge-danger" style={{ marginLeft: '6px' }}>Voided</span>}
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  {sale.customerName || 'Walk-in'} · {formatCurrency(sale.grandTotal || 0)} · {sale.paymentMethod}
                  {' · '}{new Date(sale.createdAt).toLocaleString()}
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => printSaleReceipt(sale)}>
                <FiPrinter /> Reprint
              </button>
            </div>
          ))
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default ReprintModal;
