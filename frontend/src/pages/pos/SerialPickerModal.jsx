import React, { useState, useEffect } from 'react';
import { FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { TrackingAPI } from '../../services/api';

// Serial-tracked products can't be sold anonymously — the cashier picks the
// exact units leaving the store. The cart quantity IS the number of serials
// chosen, so this modal replaces the usual +/- quantity controls.
const SerialPickerModal = ({ product, initialSelected = [], onConfirm, onClose }) => {
  const [serials, setSerials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set(initialSelected));
  const [search, setSearch] = useState('');

  useEffect(() => {
    TrackingAPI.getSerials({ productId: product.id, status: 'in_stock', limit: 500 })
      .then(res => { if (res.data?.success) setSerials(res.data.data || []); })
      .catch(() => toast.error('Failed to load serial numbers'))
      .finally(() => setLoading(false));
  }, [product.id]);

  const toggle = (serial) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(serial)) next.delete(serial); else next.add(serial);
      return next;
    });
  };

  const visible = serials.filter(s =>
    !search || s.serial.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '440px', width: '100%', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Select Serial Numbers</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '12px' }}>
          {product.name} — pick the exact unit(s) being sold. Quantity = number selected.
        </p>

        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
          <input className="form-input" style={{ paddingLeft: '36px' }} placeholder="Scan or search serial..."
            value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>Loading serials...</div>
        ) : serials.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
            No in-stock serials registered for this product. Receive a PO with serials, or register them under Inventory → Serials &amp; Batches.
          </div>
        ) : (
          <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '16px' }}>
            {visible.map(s => (
              <label key={s._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: selected.has(s.serial) ? '#F0FDF4' : 'transparent' }}>
                <input type="checkbox" checked={selected.has(s.serial)} onChange={() => toggle(s.serial)} />
                <span style={{ fontWeight: 600 }}>{s.serial}</span>
              </label>
            ))}
            {visible.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>No serials match "{search}"</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={selected.size === 0 && initialSelected.length === 0}
              onClick={() => onConfirm([...selected])}>
              {selected.size === 0 ? 'Remove from Cart' : `Add ${selected.size} to Cart`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SerialPickerModal;
