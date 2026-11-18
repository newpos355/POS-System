import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { SalesAPI, VendorsAPI } from '../../services/api';

// Line picker + vendor select for converting sale lines into a purchase
// order. Unit cost left blank falls back to the product's cost price on the
// server.
const ConvertToPOModal = ({ sale, onClose, onSuccess }) => {
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState(() =>
    (sale.items || []).map(item => ({
      orderItemId: item._id,
      name: item.name,
      sku: item.sku,
      maxQty: Number(item.quantity) - Number(item.cancelledQty || 0),
      quantity: Number(item.quantity) - Number(item.cancelledQty || 0),
      unitCost: '',
      selected: false,
      alreadyConverted: !!item.purchaseOrderId,
    })));

  useEffect(() => {
    VendorsAPI.getVendors()
      .then(res => { if (res.data?.success) setVendors(res.data.data || []); })
      .catch(() => toast.error('Failed to load vendors'));
  }, []);

  const setLine = (idx, patch) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const submit = async (e) => {
    e.preventDefault();
    const chosen = lines.filter(l => l.selected && l.quantity > 0);
    if (!vendorId) { toast.error('Pick a vendor'); return; }
    if (chosen.length === 0) { toast.error('Select at least one line'); return; }
    setSaving(true);
    try {
      const res = await SalesAPI.convertToPO(sale._id, {
        vendorId,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        lines: chosen.map(l => ({
          orderItemId: l.orderItemId,
          quantity: Number(l.quantity),
          unitCost: l.unitCost === '' ? undefined : Number(l.unitCost),
        })),
      });
      if (res.data?.success) {
        toast.success(`Purchase order ${res.data.data.poNumber} created`);
        onSuccess?.(res.data.data);
        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to convert to PO');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Convert to Purchase Order</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          Raise a vendor PO for lines of order {sale.orderNumber}. Leave unit cost blank to use each product's cost price.
        </p>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Vendor *</label>
              <select className="form-select" value={vendorId} onChange={e => setVendorId(e.target.value)} required>
                <option value="">Select vendor...</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Expected date</label>
              <input type="date" className="form-input" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </div>
          </div>

          <table className="data-table" style={{ marginBottom: '16px' }}>
            <thead>
              <tr>
                <th style={{ width: '36px' }}></th>
                <th>Item</th>
                <th style={{ width: '100px' }}>Qty</th>
                <th style={{ width: '140px' }}>Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.orderItemId} style={l.alreadyConverted ? { opacity: 0.55 } : {}}>
                  <td>
                    <input type="checkbox" checked={l.selected} disabled={l.maxQty <= 0}
                      onChange={e => setLine(idx, { selected: e.target.checked })} />
                  </td>
                  <td>
                    <strong>{l.name}</strong> {l.sku && <span style={{ color: '#64748B', fontSize: '12px' }}>({l.sku})</span>}
                    {l.alreadyConverted && <span className="badge badge-info" style={{ marginLeft: '8px' }}>PO exists</span>}
                  </td>
                  <td>
                    <input type="number" className="form-input" min="1" max={l.maxQty} value={l.quantity}
                      onChange={e => setLine(idx, { quantity: Math.min(l.maxQty, Math.max(1, Number(e.target.value) || 1)) })} />
                  </td>
                  <td>
                    <input type="number" className="form-input" min="0" step="any" placeholder="Auto (cost)"
                      value={l.unitCost} onChange={e => setLine(idx, { unitCost: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Notes</label>
            <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConvertToPOModal;
