import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ReturnsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';

const ReturnDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canApprove = user?.role === 'admin' || user?.role === 'manager';
  const [ret, setRet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  useEffect(() => { fetchReturn(); }, [id]);

  const fetchReturn = async () => {
    try {
      setLoading(true);
      const res = await ReturnsAPI.getReturn(id);
      if (res.data?.success) setRet(res.data.data);
    } catch (error) {
      toast.error('Failed to load return');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setBusy(true);
    try {
      const res = await ReturnsAPI.approveReturn(id);
      if (res.data?.success) {
        toast.success('Return approved — stock restored.');
        setRet(res.data.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to approve return');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await ReturnsAPI.rejectReturn(id, { reason: rejectReason });
      if (res.data?.success) {
        toast.success('Return rejected.');
        setRet(res.data.data);
        setShowReject(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject return');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page-container"><div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading...</div></div>;
  if (!ret) return <div className="page-container"><div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Return not found</div></div>;

  const statusBadge = {
    pending: <span className="badge badge-warning">Pending Approval</span>,
    approved: <span className="badge badge-info">Approved</span>,
    completed: <span className="badge badge-success">Completed</span>,
    rejected: <span className="badge badge-danger">Rejected</span>,
  }[ret.status] || <span className="badge badge-default">{ret.status}</span>;

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/returns')}><FiArrowLeft /> Back</button>
          <h1 className="page-title">{ret.returnNumber}</h1>
          {statusBadge}
        </div>
        {canApprove && ret.status === 'pending' && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-danger" onClick={() => setShowReject(true)} disabled={busy}>
              <FiX /> Reject
            </button>
            <button className="btn btn-primary" onClick={handleApprove} disabled={busy}>
              <FiCheck /> {busy ? 'Approving...' : 'Approve & Restore Stock'}
            </button>
          </div>
        )}
      </div>

      {showReject && (
        <form onSubmit={handleReject} className="card" style={{ padding: '20px', marginBottom: '24px' }}>
          <div className="form-group">
            <label className="form-label">Reason for rejection</label>
            <input className="form-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Optional" />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn btn-danger" disabled={busy}>Confirm Reject</button>
            <button type="button" className="btn btn-outline" onClick={() => setShowReject(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B' }}>Details</h4>
          <p><strong>Type:</strong> {ret.type === 'cancellation' ? 'Cancellation' : 'Return'}</p>
          <p><strong>Original Order:</strong> {ret.originalOrderNumber ? (
            <Link to={`/sales/${ret.originalSaleId?._id || ret.originalSaleId}`}>{ret.originalOrderNumber}</Link>
          ) : '-'}</p>
          <p><strong>Customer:</strong> {ret.customerName || 'Walk-in Customer'}</p>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B' }}>Reason & Refund</h4>
          <p><strong>Reason:</strong> {ret.reason}</p>
          <p><strong>Refund Method:</strong> {ret.refundMethod}</p>
          {ret.notes && <p><strong>Notes:</strong> {ret.notes}</p>}
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B' }}>Processing</h4>
          <p><strong>Processed By:</strong> {ret.processedBy?.name || '-'}</p>
          <p><strong>Date:</strong> {new Date(ret.createdAt).toLocaleString()}</p>
          <p><strong>Stock Restored:</strong> {ret.stockRestored ? 'Yes' : 'Not yet'}</p>
          {ret.approvedBy?.name && <p><strong>{ret.status === 'rejected' ? 'Rejected' : 'Approved'} By:</strong> {ret.approvedBy.name}</p>}
          {ret.rejectedReason && <p><strong>Rejection Reason:</strong> {ret.rejectedReason}</p>}
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Price</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(ret.items || []).map((item, idx) => (
              <tr key={idx}>
                <td>{item.name}</td>
                <td>{item.sku}</td>
                <td>{item.quantity}</td>
                <td>{formatCurrency(item.price)}</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <div style={{ minWidth: '260px', display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#F8FAFC', borderRadius: '8px' }}>
          <strong>Total</strong>
          <strong>{formatCurrency(ret.totalAmount)}</strong>
        </div>
      </div>
    </div>
  );
};

export default ReturnDetail;
