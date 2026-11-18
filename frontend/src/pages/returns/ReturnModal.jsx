import React, { useState } from 'react';
import { FiX, FiRotateCcw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ReturnsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';

const REASONS = ['Defective', 'Wrong Item', 'Changed Mind', 'Damaged', 'Expired', 'Other'];
const REFUND_METHODS = ['Cash', 'Store Credit', 'Original Payment Method'];

// Launched from SaleDetail.jsx — lets staff select which items (and how
// many) from a completed sale are being returned. Quantity caps against
// what's already been returned are enforced authoritatively by the backend
// (returnController.createReturn); this only prevents obviously-wrong input
// client-side (negative/over the originally sold quantity).
const ReturnModal = ({ sale, onClose, onSuccess }) => {
  const [selected, setSelected] = useState({}); // productId -> qty string
  const [reason, setReason] = useState('Other');
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleItem = (item, checked) => {
    setSelected(prev => {
      const next = { ...prev };
      if (checked) next[item.productId] = String(item.quantity);
      else delete next[item.productId];
      return next;
    });
  };

  const setQty = (productId, value) => {
    setSelected(prev => ({ ...prev, [productId]: value }));
  };

  const selectedItems = (sale.items || []).filter(i => selected[i.productId] !== undefined);
  const total = selectedItems.reduce((sum, i) => sum + (Number(i.price) * (Number(selected[i.productId]) || 0)), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (selectedItems.length === 0) return toast.error('Select at least one item to return');
    for (const item of selectedItems) {
      const qty = Number(selected[item.productId]);
      if (!Number.isFinite(qty) || qty <= 0 || qty > Number(item.quantity)) {
        return toast.error(`Invalid quantity for "${item.name}"`);
      }
    }

    setSubmitting(true);
    try {
      await ReturnsAPI.createReturn({
        originalSaleId: sale._id || sale.id,
        customerId: sale.customerId?._id || sale.customerId || undefined,
        customerName: sale.customerName,
        items: selectedItems.map(i => ({
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          quantity: Number(selected[i.productId]),
        })),
        reason,
        refundMethod,
        notes,
      });
      toast.success('Return submitted successfully!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !submitting && onClose()}>
      <div className="modal" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2>Return Items — {sale.orderNumber}</h2>
          <button className="modal-close" onClick={onClose} disabled={submitting}><FiX /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label className="form-label">Select items to return</label>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              {(sale.items || []).map(item => {
                const checked = selected[item.productId] !== undefined;
                return (
                  <div
                    key={item.productId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                      borderBottom: '1px solid #F1F5F9',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => toggleItem(item, e.target.checked)}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{item.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        Sold: {item.quantity} × {formatCurrency(item.price)}
                      </div>
                    </div>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '80px' }}
                      min="1"
                      max={item.quantity}
                      disabled={!checked}
                      value={checked ? selected[item.productId] : ''}
                      onChange={e => setQty(item.productId, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <select className="form-select" value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Refund Method</label>
              <select className="form-select" value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                {REFUND_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input className="form-input" type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #E2E8F0' }}>
            <span style={{ color: '#64748B' }}>Refund total</span>
            <strong style={{ fontSize: '18px' }}>{formatCurrency(total)}</strong>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <FiRotateCcw /> {submitting ? 'Submitting...' : 'Submit Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReturnModal;
