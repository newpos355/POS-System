import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiEye, FiFilter, FiSettings } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ReturnsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_BADGE = {
  pending: <span className="badge badge-warning">Pending Approval</span>,
  approved: <span className="badge badge-info">Approved</span>,
  completed: <span className="badge badge-success">Completed</span>,
  rejected: <span className="badge badge-danger">Rejected</span>,
};

const ReturnsList = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ requireApproval: false, approvalThreshold: null });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchReturns();
    if (isAdmin) fetchSettings();
  }, []);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const res = await ReturnsAPI.getReturns({ limit: 200 });
      if (res.data?.success) setReturns(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load returns');
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await ReturnsAPI.getReturnSettings();
      if (res.data?.success) setSettings(res.data.data);
    } catch (error) {
      // Non-fatal — settings panel just won't reflect saved state.
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await ReturnsAPI.updateReturnSettings(settings);
      if (res.data?.success) {
        setSettings(res.data.data);
        toast.success('Return settings saved');
        setShowSettings(false);
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const filtered = returns.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (typeFilter && (r.type || 'return') !== typeFilter) return false;
    return true;
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Returns & Cancellations</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Customer returns, order cancellations, and their refund status
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/credit-notes" className="btn btn-outline">Credit Notes</Link>
          {isAdmin && (
            <button className="btn btn-outline" onClick={() => setShowSettings(s => !s)}>
              <FiSettings /> Return Settings
            </button>
          )}
        </div>
      </div>

      {isAdmin && showSettings && (
        <form onSubmit={saveSettings} className="card" style={{ padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <input
              type="checkbox"
              id="requireApproval"
              checked={settings.requireApproval}
              onChange={e => setSettings(s => ({ ...s, requireApproval: e.target.checked }))}
            />
            <label htmlFor="requireApproval" style={{ fontWeight: 600 }}>
              Require manager approval before stock is restored on every return
            </label>
          </div>
          <div className="form-group" style={{ maxWidth: '320px' }}>
            <label className="form-label">Or only require approval above this amount (optional)</label>
            <input
              type="number"
              className="form-input"
              min="0"
              placeholder="No threshold"
              value={settings.approvalThreshold ?? ''}
              onChange={e => setSettings(s => ({ ...s, approvalThreshold: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button type="submit" className="btn btn-primary" disabled={savingSettings}>
              {savingSettings ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiFilter style={{ color: '#64748B' }} />
          <select className="form-select" style={{ width: '200px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="form-select" style={{ width: '180px' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Returns & Cancellations</option>
            <option value="return">Returns Only</option>
            <option value="cancellation">Cancellations Only</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading returns...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>No returns or cancellations found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Return #</th>
                <th>Type</th>
                <th>Original Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Refund</th>
                <th>Amount</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r._id || r.id}>
                  <td><strong>{r.returnNumber}</strong></td>
                  <td>
                    <span className="badge badge-default">{r.type === 'cancellation' ? 'Cancellation' : 'Return'}</span>
                  </td>
                  <td>{r.originalOrderNumber || r.originalSaleId?.orderNumber || '-'}</td>
                  <td>{r.customerName || 'Walk-in Customer'}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>{r.refundMethod}</td>
                  <td><strong>{formatCurrency(r.totalAmount)}</strong></td>
                  <td>{STATUS_BADGE[r.status] || <span className="badge badge-default">{r.status}</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/returns/${r._id || r.id}`} className="btn btn-outline btn-sm">
                      <FiEye /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ReturnsList;
