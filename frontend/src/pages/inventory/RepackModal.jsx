import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { InventoryAPI } from '../../services/api';

// Convert stock of one product into another (bulk sack → retail packs).
// The target quantity is free-form — repacking is rarely perfectly lossless
// and pack sizes differ — so the operator states exactly what came out.
const RepackModal = ({ products, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    fromProductId: '', fromQty: '', toProductId: '', toQty: '',
    toBatchNumber: '', toBatchExpiryDate: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    InventoryAPI.getRepacks({ limit: 5 })
      .then(res => { if (res.data?.success) setHistory(res.data.data || []); })
      .catch(() => {});
  }, []);

  const fromProduct = products.find(p => p._id === form.fromProductId);
  const toProduct = products.find(p => p._id === form.toProductId);
  const eligible = products.filter(p => !p.isComposite && p.trackingType !== 'serial');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.fromProductId || !form.toProductId) return toast.error('Pick both products');
    if (form.fromProductId === form.toProductId) return toast.error('Source and target must differ');
    if (!(Number(form.fromQty) >= 1) || !(Number(form.toQty) >= 1)) return toast.error('Enter valid quantities');
    setSaving(true);
    try {
      const res = await InventoryAPI.repackStock({
        fromProductId: form.fromProductId,
        fromQty: Number(form.fromQty),
        toProductId: form.toProductId,
        toQty: Number(form.toQty),
        toBatchNumber: form.toBatchNumber || undefined,
        toBatchExpiryDate: form.toBatchExpiryDate || undefined,
        notes: form.notes || undefined,
      });
      if (res.data?.success) {
        toast.success(`${res.data.data.repackNumber}: ${form.fromQty} × ${fromProduct?.name} → ${form.toQty} × ${toProduct?.name}`);
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Repack failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '560px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Repack Stock</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          Convert units of one product into another — e.g. 1 bulk sack into 25 retail packs. Serial-tracked products and bundles can't be repacked.
        </p>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Take from *</label>
              <select className="form-select" value={form.fromProductId} required
                onChange={e => setForm(f => ({ ...f, fromProductId: e.target.value }))}>
                <option value="">Select source product...</option>
                {eligible.map(p => (
                  <option key={p._id} value={p._id}>{p.name} (stock: {p.stock ?? 0})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Qty out *</label>
              <input className="form-input" type="number" min="1" required value={form.fromQty}
                onChange={e => setForm(f => ({ ...f, fromQty: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Create *</label>
              <select className="form-select" value={form.toProductId} required
                onChange={e => setForm(f => ({ ...f, toProductId: e.target.value }))}>
                <option value="">Select target product...</option>
                {eligible.filter(p => p._id !== form.fromProductId).map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Qty in *</label>
              <input className="form-input" type="number" min="1" required value={form.toQty}
                onChange={e => setForm(f => ({ ...f, toQty: e.target.value }))} />
            </div>
          </div>

          {toProduct?.trackingType === 'batch' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
              <div className="form-group">
                <label className="form-label">New packs' batch number *</label>
                <input className="form-input" required value={form.toBatchNumber}
                  onChange={e => setForm(f => ({ ...f, toBatchNumber: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Batch expiry</label>
                <input className="form-input" type="date" value={form.toBatchExpiryDate}
                  onChange={e => setForm(f => ({ ...f, toBatchExpiryDate: e.target.value }))} />
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Notes</label>
            <input className="form-input" value={form.notes} placeholder="Optional"
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: history.length ? '16px' : 0 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Repacking...' : 'Repack'}
            </button>
          </div>
        </form>

        {history.length > 0 && (
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', marginBottom: '8px' }}>RECENT REPACKS</p>
            {history.map(r => (
              <p key={r._id} style={{ fontSize: '13px', margin: '4px 0', color: '#334155' }}>
                <strong>{r.repackNumber}</strong> — {r.fromQty} × {r.fromName} → {r.toQty} × {r.toName}
                <span style={{ color: '#94A3B8' }}> · {new Date(r.createdAt).toLocaleDateString()}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RepackModal;
