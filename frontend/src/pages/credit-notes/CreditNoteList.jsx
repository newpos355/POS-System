import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiFilter, FiXCircle, FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { CreditNotesAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_BADGE = {
  open: <span className="badge badge-success">Open</span>,
  partially_redeemed: <span className="badge badge-warning">Partially Redeemed</span>,
  redeemed: <span className="badge badge-default">Fully Redeemed</span>,
  void: <span className="badge badge-danger">Void</span>,
};

const CreditNoteList = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [voidingId, setVoidingId] = useState(null);

  useEffect(() => { fetchNotes(); }, []);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await CreditNotesAPI.getCreditNotes({ limit: 200 });
      if (res.data?.success) setNotes(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load credit notes');
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async (id) => {
    if (!window.confirm('Void this credit note? Any unredeemed balance will be removed from the customer\'s store credit.')) return;
    setVoidingId(id);
    try {
      await CreditNotesAPI.voidCreditNote(id);
      toast.success('Credit note voided.');
      fetchNotes();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to void credit note');
    } finally {
      setVoidingId(null);
    }
  };

  const filtered = notes.filter(n => !statusFilter || n.status === statusFilter);

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link to="/returns" className="btn btn-outline btn-sm"><FiArrowLeft /> Returns</Link>
          <div>
            <h1 className="page-title">Credit Notes</h1>
            <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Store credit issued to customers and its redemption status</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiFilter style={{ color: '#64748B' }} />
          <select className="form-select" style={{ width: '220px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="partially_redeemed">Partially Redeemed</option>
            <option value="redeemed">Fully Redeemed</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading credit notes...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>No credit notes found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Credit Note #</th>
                <th>Customer</th>
                <th>Source</th>
                <th>Issued</th>
                <th>Amount</th>
                <th>Remaining</th>
                <th>Status</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(n => (
                <tr key={n._id || n.id}>
                  <td><strong>{n.creditNoteNumber}</strong></td>
                  <td>{n.customerId?.name || n.customerName || 'Unknown'}</td>
                  <td>
                    {n.sourceReturnId?.returnNumber ? (
                      <Link to={`/returns/${n.sourceReturnId._id || n.sourceReturnId}`}>{n.sourceReturnId.returnNumber}</Link>
                    ) : (
                      <span className="badge badge-default">{n.sourceType === 'manual' ? 'Manual' : n.sourceType}</span>
                    )}
                  </td>
                  <td>{new Date(n.createdAt).toLocaleDateString()}</td>
                  <td>{formatCurrency(n.amount)}</td>
                  <td><strong>{formatCurrency(n.remainingAmount)}</strong></td>
                  <td>{STATUS_BADGE[n.status] || <span className="badge badge-default">{n.status}</span>}</td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      {(n.status === 'open' || n.status === 'partially_redeemed') && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleVoid(n._id || n.id)}
                          disabled={voidingId === (n._id || n.id)}
                        >
                          <FiXCircle /> Void
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CreditNoteList;
