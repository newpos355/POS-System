import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiFilter, FiEye } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { PicklistsAPI } from '../../services/api';
import FulfillmentTabs from './FulfillmentTabs';

const STATUS_BADGE = {
  open: <span className="badge badge-default">Open</span>,
  in_progress: <span className="badge badge-info">In Progress</span>,
  picked: <span className="badge badge-success">Picked</span>,
  cancelled: <span className="badge badge-danger">Cancelled</span>,
};

const PicklistList = () => {
  const [picklists, setPicklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchPicklists();
  }, [statusFilter]);

  const fetchPicklists = async () => {
    try {
      setLoading(true);
      const res = await PicklistsAPI.getPicklists(statusFilter ? { status: statusFilter } : {});
      if (res.data?.success) setPicklists(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load picklists');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <FulfillmentTabs />
      <div className="page-header">
        <div>
          <h1 className="page-title">Picklists</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Warehouse pick sheets. Create one from a sale's detail page ("Create Picklist").
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiFilter style={{ color: '#64748B' }} />
          <select
            className="form-select"
            style={{ width: '200px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="picked">Picked</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading picklists...</div>
        ) : picklists.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            No picklists yet. Open a sale and click "Create Picklist" to start one.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Picklist</th>
                <th>Order(s)</th>
                <th>Created</th>
                <th>Items</th>
                <th>Progress</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {picklists.map(pl => {
                const requested = (pl.items || []).reduce((s, i) => s + (i.requestedQty || 0), 0);
                const picked = (pl.items || []).reduce((s, i) => s + (i.pickedQty || 0), 0);
                return (
                  <tr key={pl._id}>
                    <td><strong>{pl.picklistNumber}</strong></td>
                    <td>{(pl.orderNumbers || []).join(', ')}</td>
                    <td>{new Date(pl.createdAt).toLocaleString()}</td>
                    <td><span className="badge badge-default">{pl.items?.length || 0} lines</span></td>
                    <td>{picked} / {requested} units</td>
                    <td>{STATUS_BADGE[pl.status] || pl.status}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/picklists/${pl._id}`} className="btn btn-outline btn-sm">
                        <FiEye /> Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PicklistList;
