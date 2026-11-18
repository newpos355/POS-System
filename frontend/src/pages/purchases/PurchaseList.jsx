import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiFilter, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { PurchasesAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import './purchases.css';

const SOURCE_LABEL = {
  sales_order: <span className="badge badge-info">From Sale</span>,
  backorder: <span className="badge badge-warning">Backorder</span>,
  dropship: <span className="badge badge-info">Dropship</span>,
};

const PurchaseList = () => {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [receivingPO, setReceivingPO] = useState(null); // PO being received via modal

  useEffect(() => {
    fetchPurchases();
  }, []);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const res = await PurchasesAPI.getPurchaseOrders();
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setPurchases(res.data.data);
      }
    } catch (error) {
      console.error('Fetch purchases error:', error);
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const filteredPurchases = purchases.filter(p =>
    statusFilter ? p.status === statusFilter : true
  );

  const getStatusBadge = (status) => {
    switch(status) {
      case 'draft': return <span className="badge badge-default">Draft</span>;
      case 'ordered': return <span className="badge badge-info">Ordered</span>;
      case 'partial': return <span className="badge badge-warning">Partial</span>;
      case 'received': return <span className="badge badge-success">Received</span>;
      case 'cancelled': return <span className="badge badge-danger">Cancelled</span>;
      default: return <span className="badge badge-default">{status}</span>;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Manage vendor purchase orders, receiving and tracking</p>
        </div>
        <Link to="/purchases/new" className="btn btn-primary">
          <FiPlus /> New Purchase Order
        </Link>
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
            <option value="draft">Draft</option>
            <option value="ordered">Ordered</option>
            <option value="partial">Partial</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading purchase orders from database...</div>
        ) : filteredPurchases.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>No purchase orders found. Click "+ New Purchase Order" to create one.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Vendor</th>
                <th>Source</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map(po => (
                <tr key={po.id || po._id}>
                  <td><strong>{po.poNumber}</strong></td>
                  <td>{po.vendor?.name || 'Unknown Vendor'}</td>
                  <td>
                    {SOURCE_LABEL[po.sourceType] || <span style={{ color: '#94A3B8', fontSize: '13px' }}>Manual</span>}
                    {(po.sourceOrders || []).map(so => (
                      <div key={so._id}>
                        <Link to={`/sales/${so._id}`} style={{ fontSize: '12px' }}>{so.orderNumber}</Link>
                      </div>
                    ))}
                  </td>
                  <td>{new Date(po.createdAt || po.date).toLocaleDateString()}</td>
                  <td><span className="badge badge-default">{po.itemsCount || po.items?.length || 0} items</span></td>
                  <td><strong>{formatCurrency(po.grandTotal || po.total || 0)}</strong></td>
                  <td>{getStatusBadge(po.status)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      {!['received', 'cancelled'].includes(po.status) && (
                        <button
                          onClick={() => setReceivingPO(po)}
                          className="btn btn-success btn-sm"
                          title={po.sourceType === 'dropship'
                            ? 'Record vendor fulfillment (ships straight to the customer, no stock added)'
                            : 'Receive items and add to stock'}
                        >
                          <FiCheckCircle /> Receive Items
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {receivingPO && (
        <ReceiveModal
          po={receivingPO}
          onClose={() => setReceivingPO(null)}
          onSuccess={() => { setReceivingPO(null); fetchPurchases(); }}
        />
      )}
    </div>
  );
};

// Per-line receive quantities. Defaults to "everything still outstanding" so
// the one-click full receive stays as easy as before, but any line can be
// dialed down for a partial receipt — the PO then shows status "Partial" and
// can be received again later for the rest. Serial-tracked lines collect the
// arriving units' serials; batch-tracked lines collect a batch number and
// expiry (fetched from the full PO, which populates each product's tracking
// type).
const ReceiveModal = ({ po, onClose, onSuccess }) => {
  const receivedSoFar = (productId) =>
    (po.receivedItems || [])
      .filter(r => String(r.productId) === String(productId))
      .reduce((s, r) => s + Number(r.quantity || 0), 0);

  const [lines, setLines] = useState(() =>
    (po.items || [])
      .map(item => {
        const already = receivedSoFar(item.productId);
        const remaining = Math.max(0, Number(item.quantity) - already);
        return {
          productId: item.productId,
          name: item.name,
          ordered: Number(item.quantity),
          already,
          remaining,
          receivedQty: remaining,
          trackingType: 'none',
          serialText: '',
          batchNumber: '',
          batchExpiryDate: '',
        };
      })
      .filter(l => l.remaining > 0));
  const [saving, setSaving] = useState(false);
  const isDropship = po.sourceType === 'dropship';

  // The list payload doesn't carry tracking types — the single-PO endpoint
  // populates them.
  useEffect(() => {
    if (isDropship) return; // dropship receipts never take stock or ledgers
    PurchasesAPI.getPurchaseOrder(po._id)
      .then(res => {
        const full = res.data?.data;
        if (!full) return;
        setLines(prev => prev.map(l => {
          const match = (full.items || []).find(i =>
            String(i.productId?._id || i.productId) === String(l.productId));
          return { ...l, trackingType: match?.productId?.trackingType || 'none' };
        }));
      })
      .catch(() => {});
  }, [po._id]);

  const setLine = (idx, patch) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const parseSerials = (text) =>
    [...new Set(text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean))];

  const submit = async (e) => {
    e.preventDefault();
    const active = lines.filter(l => l.receivedQty > 0);
    if (active.length === 0) {
      toast.error('Set at least one received quantity');
      return;
    }
    if (!isDropship) {
      for (const l of active) {
        if (l.trackingType === 'serial') {
          const serials = parseSerials(l.serialText);
          if (serials.length !== l.receivedQty) {
            toast.error(`"${l.name}": enter exactly ${l.receivedQty} serial number(s) — got ${serials.length}`);
            return;
          }
        }
        if (l.trackingType === 'batch' && !l.batchNumber.trim()) {
          toast.error(`"${l.name}": a batch number is required`);
          return;
        }
      }
    }
    const receivedItems = active.map(l => ({
      productId: l.productId,
      receivedQty: Number(l.receivedQty),
      serials: l.trackingType === 'serial' ? parseSerials(l.serialText) : undefined,
      batchNumber: l.trackingType === 'batch' ? l.batchNumber.trim() : undefined,
      batchExpiryDate: l.trackingType === 'batch' && l.batchExpiryDate ? l.batchExpiryDate : undefined,
    }));
    setSaving(true);
    try {
      const res = await PurchasesAPI.receiveItems(po._id, { receivedItems });
      if (res.data?.success) {
        toast.success(res.data.message || 'Items received');
        if (res.data.allocated?.length) {
          toast.success(`${res.data.allocated.length} backordered line(s) allocated to waiting orders`);
        }
        onSuccess();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to receive items');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Receive {po.poNumber}</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          {isDropship
            ? 'Dropship PO — recording fulfillment marks the customer\'s order lines as shipped. Nothing is added to your stock.'
            : 'Adjust quantities for a partial receipt; received stock is added to inventory immediately.'}
        </p>
        <form onSubmit={submit}>
          <table className="data-table" style={{ marginBottom: '16px' }}>
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: 'center' }}>Ordered</th>
                <th style={{ textAlign: 'center' }}>Received</th>
                <th style={{ width: '120px' }}>Receive now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <React.Fragment key={String(l.productId)}>
                  <tr>
                    <td>
                      <strong>{l.name}</strong>
                      {l.trackingType === 'serial' && <span className="badge badge-info" style={{ marginLeft: '6px' }}>Serial</span>}
                      {l.trackingType === 'batch' && <span className="badge badge-info" style={{ marginLeft: '6px' }}>Batch</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{l.ordered}</td>
                    <td style={{ textAlign: 'center' }}>{l.already}</td>
                    <td>
                      <input type="number" className="form-input" min="0" max={l.remaining}
                        value={l.receivedQty}
                        onChange={e => setLine(idx, { receivedQty: Math.min(l.remaining, Math.max(0, Number(e.target.value) || 0)) })} />
                    </td>
                  </tr>
                  {!isDropship && l.trackingType === 'serial' && l.receivedQty > 0 && (
                    <tr>
                      <td colSpan="4" style={{ background: '#F8FAFC' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                          Serial numbers ({parseSerials(l.serialText).length}/{l.receivedQty}) — one per line or comma-separated
                        </label>
                        <textarea className="form-textarea" rows="3" value={l.serialText}
                          onChange={e => setLine(idx, { serialText: e.target.value })}
                          placeholder={'SN-0001\nSN-0002'} />
                      </td>
                    </tr>
                  )}
                  {!isDropship && l.trackingType === 'batch' && l.receivedQty > 0 && (
                    <tr>
                      <td colSpan="4" style={{ background: '#F8FAFC' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Batch number *</label>
                            <input className="form-input" value={l.batchNumber}
                              onChange={e => setLine(idx, { batchNumber: e.target.value })} />
                          </div>
                          <div style={{ width: '170px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Expiry date</label>
                            <input className="form-input" type="date" value={l.batchExpiryDate}
                              onChange={e => setLine(idx, { batchExpiryDate: e.target.value })} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Receiving...' : (isDropship ? 'Record Fulfillment' : 'Receive')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PurchaseList;
