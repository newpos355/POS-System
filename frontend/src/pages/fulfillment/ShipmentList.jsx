import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiFilter, FiEye } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ShipmentsAPI } from '../../services/api';
import FulfillmentTabs from './FulfillmentTabs';

export const SHIPMENT_STATUS_BADGE = {
  draft: <span className="badge badge-default">Draft</span>,
  packed: <span className="badge badge-info">Packed</span>,
  dispatched: <span className="badge badge-warning">Dispatched</span>,
  in_transit: <span className="badge badge-warning">In Transit</span>,
  delivered: <span className="badge badge-success">Delivered</span>,
  returned: <span className="badge badge-danger">Returned</span>,
  cancelled: <span className="badge badge-danger">Cancelled</span>,
};

const ShipmentList = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchShipments();
  }, [statusFilter]);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const res = await ShipmentsAPI.getShipments(statusFilter ? { status: statusFilter } : {});
      if (res.data?.success) setShipments(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load shipments');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <FulfillmentTabs />
      <div className="page-header">
        <div>
          <h1 className="page-title">Shipments</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Packing and delivery tracking. Create one from a sale's detail page ("Create Shipment").
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
            <option value="packed">Packed</option>
            <option value="dispatched">Dispatched</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="returned">Returned</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading shipments...</div>
        ) : shipments.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            No shipments yet. Open a sale and click "Create Shipment" to pack one.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Shipment</th>
                <th>Order</th>
                <th>Ship To</th>
                <th>Origin</th>
                <th>Carrier</th>
                <th>Packages</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(sh => (
                <tr key={sh._id}>
                  <td><strong>{sh.shipmentNumber}</strong></td>
                  <td>{sh.orderNumber || '-'}</td>
                  <td>{sh.shipToAddress?.name || sh.customerId?.name || '-'}</td>
                  <td>
                    {sh.origin === 'vendor'
                      ? <span className="badge badge-info">Vendor (dropship)</span>
                      : <span className="badge badge-default">Branch</span>}
                  </td>
                  <td>{sh.carrier?.name || '-'}</td>
                  <td><span className="badge badge-default">{sh.packages?.length || 0}</span></td>
                  <td>{SHIPMENT_STATUS_BADGE[sh.status] || sh.status}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/shipments/${sh._id}`} className="btn btn-outline btn-sm">
                      <FiEye /> Open
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

export default ShipmentList;
