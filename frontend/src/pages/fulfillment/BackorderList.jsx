import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiRefreshCw, FiShoppingBag } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { SalesAPI, VendorsAPI } from '../../services/api';
import FulfillmentTabs from './FulfillmentTabs';

// Every still-open backordered line across all sales, with a bulk "Create
// replenishment PO" action. Lines whose replenishment PO already exists show
// its number/status instead of a checkbox.
const BackorderList = () => {
  const [lines, setLines] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [fallbackVendorId, setFallbackVendorId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [boRes, vRes] = await Promise.all([
        SalesAPI.getBackorders(),
        VendorsAPI.getVendors().catch(() => null),
      ]);
      if (boRes.data?.success) setLines(boRes.data.data || []);
      if (vRes?.data?.success) setVendors(vRes.data.data || []);
      setSelected(new Set());
    } catch (error) {
      toast.error('Failed to load backorders');
    } finally {
      setLoading(false);
    }
  };

  const lineKey = (l) => `${l.salesOrderId}:${l.orderItemId}`;
  const openLines = lines.filter(l => !l.purchaseOrder);

  const toggle = (l) => {
    setSelected(prev => {
      const next = new Set(prev);
      const key = lineKey(l);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === openLines.length) setSelected(new Set());
    else setSelected(new Set(openLines.map(lineKey)));
  };

  const handleReplenish = async () => {
    const chosen = openLines.filter(l => selected.has(lineKey(l)));
    if (chosen.length === 0) {
      toast.error('Select at least one backordered line first');
      return;
    }
    // Lines without a preferred vendor need the fallback vendor picked.
    const missingVendor = chosen.some(l => !l.preferredVendorId);
    if (missingVendor && !fallbackVendorId) {
      toast.error('Some selected products have no preferred vendor — pick a fallback vendor first');
      return;
    }
    setCreating(true);
    try {
      const res = await SalesAPI.replenishBackorders({
        lines: chosen.map(l => ({ salesOrderId: l.salesOrderId, orderItemId: l.orderItemId })),
        vendorId: fallbackVendorId || undefined,
      });
      if (res.data?.success) {
        const pos = res.data.data || [];
        toast.success(`Created ${pos.length} purchase order(s): ${pos.map(p => p.poNumber).join(', ')}`);
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create replenishment PO');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-container">
      <FulfillmentTabs />
      <div className="page-header">
        <div>
          <h1 className="page-title">Backorders</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Sold-but-unavailable quantities waiting on replenishment. Receiving the linked PO allocates arrived stock to these orders automatically.
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
          <FiRefreshCw /> Refresh
        </button>
      </div>

      {openLines.length > 0 && (
        <div className="card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            style={{ width: '260px' }}
            value={fallbackVendorId}
            onChange={e => setFallbackVendorId(e.target.value)}
          >
            <option value="">Fallback vendor (for products without one)</option>
            {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={handleReplenish} disabled={creating || selected.size === 0}>
            <FiShoppingBag /> {creating ? 'Creating...' : `Create Replenishment PO (${selected.size})`}
          </button>
        </div>
      )}

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading backorders...</div>
        ) : lines.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            No open backorders. Backorders appear when a POS sale is completed with "Allow backorder" for a product that's short on stock.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }}>
                  <input
                    type="checkbox"
                    checked={openLines.length > 0 && selected.size === openLines.length}
                    onChange={toggleAll}
                  />
                </th>
                <th>Order</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Product</th>
                <th style={{ textAlign: 'center' }}>Backordered</th>
                <th style={{ textAlign: 'center' }}>Reserved</th>
                <th>Replenishment PO</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={lineKey(l)}>
                  <td>
                    {!l.purchaseOrder && (
                      <input type="checkbox" checked={selected.has(lineKey(l))} onChange={() => toggle(l)} />
                    )}
                  </td>
                  <td><Link to={`/sales/${l.salesOrderId}`} style={{ fontWeight: 600 }}>{l.orderNumber}</Link></td>
                  <td>{new Date(l.orderDate).toLocaleDateString()}</td>
                  <td>{l.customerName}</td>
                  <td><strong>{l.productName}</strong> {l.sku && <span style={{ color: '#64748B', fontSize: '12px' }}>({l.sku})</span>}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="badge badge-warning">{l.backorderedQty}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{l.reservedQty} / {l.quantity}</td>
                  <td>
                    {l.purchaseOrder ? (
                      <span>
                        <strong>{l.purchaseOrder.poNumber}</strong>{' '}
                        <span className={`badge ${l.purchaseOrder.status === 'received' ? 'badge-success' : 'badge-info'}`}>
                          {l.purchaseOrder.status}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: '#94A3B8', fontSize: '13px' }}>Not ordered yet</span>
                    )}
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

export default BackorderList;
