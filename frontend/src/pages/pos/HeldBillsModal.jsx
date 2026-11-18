import React, { useState, useEffect } from 'react';
import { FiTrash2, FiCornerDownLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { HeldBillsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';

// Held (parked) bills, recallable from any terminal. Recalling restores the
// cart and deletes the hold; no stock is reserved while a bill is parked.
const HeldBillsModal = ({ onRecall, onClose }) => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBills = () => {
    HeldBillsAPI.getHeldBills()
      .then(res => { if (res.data?.success) setBills(res.data.data || []); })
      .catch(() => toast.error('Failed to load held bills'))
      .finally(() => setLoading(false));
  };

  useEffect(fetchBills, []);

  const cartTotal = (bill) =>
    (bill.cart || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);

  const handleRecall = async (bill) => {
    try {
      await HeldBillsAPI.deleteHeldBill(bill._id);
      onRecall(bill);
    } catch (error) {
      // 404 = someone else recalled it first on another terminal.
      toast.error(error.response?.data?.message || 'Failed to recall — refresh and try again');
      fetchBills();
    }
  };

  const handleDiscard = async (bill) => {
    if (!window.confirm(`Discard held bill "${bill.label || bill.customerName || 'Unnamed'}"?`)) return;
    try {
      await HeldBillsAPI.deleteHeldBill(bill._id);
      toast.success('Held bill discarded');
      fetchBills();
    } catch (error) {
      toast.error('Failed to discard');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '520px', width: '100%', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Held Bills</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          Recalling replaces the current cart. Held bills don't reserve stock.
        </p>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>Loading…</div>
        ) : bills.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
            No bills on hold. Use the "Hold" button to park the current cart.
          </div>
        ) : (
          bills.map(bill => (
            <div key={bill._id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '10px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <strong>{bill.label || bill.customerName || 'Unnamed bill'}</strong>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  {(bill.cart || []).length} item(s) · {formatCurrency(cartTotal(bill))}
                  {' · '}{new Date(bill.createdAt).toLocaleTimeString()}
                  {bill.heldByName ? ` · by ${bill.heldByName}` : ''}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => handleRecall(bill)}>
                <FiCornerDownLeft /> Recall
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDiscard(bill)}>
                <FiTrash2 />
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

export default HeldBillsModal;
