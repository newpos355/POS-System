import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiDollarSign, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { SalesAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';

const PAY_METHODS = ['Cash', 'Card', 'Airtel Money', 'MTN MoMo', 'Bank Transfer', 'Other'];

// Credit sales with money still owed. "Record Payment" pays a bill down
// (partially or in full) and shrinks the customer's outstanding credit.
const DueBills = () => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null); // sale being paid

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await SalesAPI.getSales({ dueOnly: 1, limit: 200 });
      if (res.data?.success) setBills(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load due bills');
    } finally {
      setLoading(false);
    }
  };

  const totalDue = bills.reduce((s, b) => s + (Number(b.paymentDetails?.balanceDue) || 0), 0);
  const overdueCount = bills.filter(b => b.paymentDetails?.balanceDueDate
    && new Date(b.paymentDetails.balanceDueDate) < new Date()).length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Due Bills</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Credit sales with an outstanding balance. Record payments here as customers settle.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/sales" className="btn btn-outline">All Sales</Link>
          <button className="btn btn-outline" onClick={fetchBills} disabled={loading}>
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#64748B', fontSize: '12px', textTransform: 'uppercase', fontWeight: 500, margin: '0 0 4px' }}>Open Bills</p>
          <h3 style={{ margin: 0, fontSize: '24px' }}>{bills.length}</h3>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#DC2626', fontSize: '12px', textTransform: 'uppercase', fontWeight: 500, margin: '0 0 4px' }}>Total Outstanding</p>
          <h3 style={{ margin: 0, fontSize: '24px', color: '#DC2626' }}>{formatCurrency(totalDue)}</h3>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#D97706', fontSize: '12px', textTransform: 'uppercase', fontWeight: 500, margin: '0 0 4px' }}>Overdue</p>
          <h3 style={{ margin: 0, fontSize: '24px', color: '#D97706' }}>{overdueCount}</h3>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading due bills...</div>
        ) : bills.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            🎉 No outstanding bills — every credit sale is settled.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Balance Due</th>
                <th>Due By</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(bill => {
                const pd = bill.paymentDetails || {};
                const overdue = pd.balanceDueDate && new Date(pd.balanceDueDate) < new Date();
                return (
                  <tr key={bill._id} style={overdue ? { background: '#FEF2F2' } : {}}>
                    <td><Link to={`/sales/${bill._id}`} style={{ fontWeight: 600 }}>{bill.orderNumber}</Link></td>
                    <td>{bill.customerName || bill.customerId?.name || '-'}</td>
                    <td>{new Date(bill.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(bill.grandTotal || 0)}</td>
                    <td style={{ textAlign: 'right', color: '#16A34A' }}>{formatCurrency(pd.amountPaid || 0)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <strong style={{ color: '#DC2626' }}>{formatCurrency(pd.balanceDue || 0)}</strong>
                    </td>
                    <td>
                      {pd.balanceDueDate
                        ? <span style={overdue ? { color: '#DC2626', fontWeight: 700 } : {}}>
                            {new Date(pd.balanceDueDate).toLocaleDateString()}{overdue ? ' ⚠️' : ''}
                          </span>
                        : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setPaying(bill)}>
                        <FiDollarSign /> Record Payment
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {paying && (
        <RecordPaymentModal
          bill={paying}
          onClose={() => setPaying(null)}
          onSuccess={() => { setPaying(null); fetchBills(); }}
        />
      )}
    </div>
  );
};

const RecordPaymentModal = ({ bill, onClose, onSuccess }) => {
  const due = Number(bill.paymentDetails?.balanceDue) || 0;
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState('Cash');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');
    if (amt > due + 0.001) return toast.error(`Balance due is only ${formatCurrency(due)}`);
    setSaving(true);
    try {
      const res = await SalesAPI.recordPayment(bill._id, { amount: amt, method, reference: reference || undefined });
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
        <h2 style={{ marginBottom: '4px' }}>Record Payment</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          {bill.orderNumber} — {bill.customerName || 'Customer'} owes <strong style={{ color: '#DC2626' }}>{formatCurrency(due)}</strong>
        </p>
        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Amount *</label>
            <input className="form-input" type="number" min="0.01" max={due} step="any" autoFocus
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

export default DueBills;
