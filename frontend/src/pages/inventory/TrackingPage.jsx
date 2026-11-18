import React, { useState, useEffect } from 'react';
import { FiPlus, FiSearch, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { TrackingAPI, ProductsAPI } from '../../services/api';
import InventoryTabs from './InventoryTabs';
import { useAuth } from '../../contexts/AuthContext';

const SERIAL_BADGE = {
  in_stock: <span className="badge badge-success">In Stock</span>,
  sold: <span className="badge badge-info">Sold</span>,
  returned: <span className="badge badge-warning">Returned</span>,
  defective: <span className="badge badge-danger">Defective</span>,
};

// Serial & batch ledgers. Serials/batches are normally created automatically
// when a PO is received; this page covers reading them, registering opening
// stock, and post-return inspection (flipping a returned serial back to
// in-stock once it's been checked).
const TrackingPage = () => {
  const { user } = useAuth();
  const canManage = ['admin', 'manager'].includes((user?.role || '').toLowerCase());
  const [tab, setTab] = useState('serials');
  const [products, setProducts] = useState([]);
  const [serials, setSerials] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    ProductsAPI.getProducts({ limit: 200 })
      .then(res => { if (res.data?.data) setProducts(res.data.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [tab, productFilter, statusFilter, search]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = {
        productId: productFilter || undefined,
        search: search || undefined,
      };
      if (tab === 'serials') {
        const res = await TrackingAPI.getSerials({ ...params, status: statusFilter || undefined });
        if (res.data?.success) setSerials(res.data.data || []);
      } else {
        const res = await TrackingAPI.getBatches(params);
        if (res.data?.success) setBatches(res.data.data || []);
      }
    } catch (error) {
      toast.error('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  };

  const handleSerialStatus = async (serial, status) => {
    try {
      const res = await TrackingAPI.updateSerialStatus(serial._id, status);
      if (res.data?.success) {
        toast.success(`${serial.serial} → ${status.replace('_', ' ')}`);
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update serial');
    }
  };

  const handleDeleteSerial = async (serial) => {
    if (!window.confirm(`Delete serial "${serial.serial}"? (Does not change stock counts.)`)) return;
    try {
      await TrackingAPI.deleteSerial(serial._id);
      toast.success('Serial deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete serial');
    }
  };

  const expiryBadge = (batch) => {
    if (!batch.expiryDate) return <span style={{ color: '#94A3B8' }}>—</span>;
    const days = Math.ceil((new Date(batch.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    const dateStr = new Date(batch.expiryDate).toLocaleDateString();
    if (days < 0) return <span className="badge badge-danger">Expired {dateStr}</span>;
    if (days <= 30) return <span className="badge badge-warning">{dateStr} ({days}d)</span>;
    return <span>{dateStr}</span>;
  };

  return (
    <div className="page-container">
      <InventoryTabs />
      <div className="page-header">
        <div>
          <h1 className="page-title">Serial & Batch Tracking</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Unit-level ledgers for tracked products. New entries are created automatically when purchase orders are received.
          </p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <FiPlus /> {tab === 'serials' ? 'Register Serials' : 'Register Batch'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button className={`btn btn-sm ${tab === 'serials' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('serials')}>
          Serial Numbers
        </button>
        <button className={`btn btn-sm ${tab === 'batches' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('batches')}>
          Batches / Lots
        </button>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <FiSearch style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
          <input className="form-input" style={{ paddingLeft: '40px' }}
            placeholder={tab === 'serials' ? 'Search serial number...' : 'Search batch number...'}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: '240px' }} value={productFilter} onChange={e => setProductFilter(e.target.value)}>
          <option value="">All products</option>
          {products.filter(p => p.trackingType === (tab === 'serials' ? 'serial' : 'batch')).map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
        {tab === 'serials' && (
          <select className="form-select" style={{ width: '160px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="in_stock">In Stock</option>
            <option value="sold">Sold</option>
            <option value="returned">Returned</option>
            <option value="defective">Defective</option>
          </select>
        )}
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading...</div>
        ) : tab === 'serials' ? (
          serials.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              No serial numbers found. Set a product's tracking type to "Serial" (product form), then receive a PO with serials or register them here.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Sold On</th>
                  <th>Received</th>
                  {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {serials.map(s => (
                  <tr key={s._id}>
                    <td><strong>{s.serial}</strong></td>
                    <td>{s.productId?.name || '-'} {s.productId?.sku && <span style={{ color: '#64748B', fontSize: '12px' }}>({s.productId.sku})</span>}</td>
                    <td>{SERIAL_BADGE[s.status] || s.status}</td>
                    <td>{s.salesOrderId?.orderNumber || s.orderNumber || '-'}</td>
                    <td>{new Date(s.receivedAt || s.createdAt).toLocaleDateString()}</td>
                    {canManage && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {['returned', 'defective'].includes(s.status) && (
                            <button className="btn btn-outline btn-sm" onClick={() => handleSerialStatus(s, 'in_stock')}>
                              Back to Stock
                            </button>
                          )}
                          {s.status === 'in_stock' && (
                            <button className="btn btn-outline btn-sm" onClick={() => handleSerialStatus(s, 'defective')}>
                              Mark Defective
                            </button>
                          )}
                          {s.status !== 'sold' && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSerial(s)}>
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          batches.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              No batches found. Set a product's tracking type to "Batch" (product form), then receive a PO with a batch number or register one here.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'center' }}>Remaining</th>
                  <th style={{ textAlign: 'center' }}>Received</th>
                  <th>Expiry</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b._id}>
                    <td><strong>{b.batchNumber}</strong></td>
                    <td>{b.productId?.name || '-'} {b.productId?.sku && <span style={{ color: '#64748B', fontSize: '12px' }}>({b.productId.sku})</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${b.quantity <= 0 ? 'badge-default' : 'badge-success'}`}>{b.quantity}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{b.initialQuantity}</td>
                    <td>{expiryBadge(b)}</td>
                    <td>{new Date(b.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {showAddModal && (
        <AddTrackingModal
          mode={tab}
          products={products}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); fetchData(); }}
        />
      )}
    </div>
  );
};

// Register opening-stock serials or a batch manually. "Also add to stock"
// covers brand-new stock; leave it off when labelling units already counted.
const AddTrackingModal = ({ mode, products, onClose, onSuccess }) => {
  const [productId, setProductId] = useState('');
  const [serialText, setSerialText] = useState('');
  const [batchForm, setBatchForm] = useState({ batchNumber: '', quantity: '', expiryDate: '' });
  const [addStock, setAddStock] = useState(false);
  const [saving, setSaving] = useState(false);

  const eligible = products.filter(p => p.trackingType === (mode === 'serials' ? 'serial' : 'batch'));

  const submit = async (e) => {
    e.preventDefault();
    if (!productId) return toast.error('Pick a product');
    setSaving(true);
    try {
      if (mode === 'serials') {
        const serials = serialText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        if (serials.length === 0) { toast.error('Enter at least one serial'); setSaving(false); return; }
        const res = await TrackingAPI.addSerials({ productId, serials, addStock });
        if (res.data?.success) {
          toast.success(`${res.data.data.length} serial(s) registered${addStock ? ' and added to stock' : ''}`);
          onSuccess();
        }
      } else {
        if (!batchForm.batchNumber.trim() || !(Number(batchForm.quantity) > 0)) {
          toast.error('Batch number and a positive quantity are required'); setSaving(false); return;
        }
        const res = await TrackingAPI.addBatch({
          productId,
          batchNumber: batchForm.batchNumber.trim(),
          quantity: Number(batchForm.quantity),
          expiryDate: batchForm.expiryDate || undefined,
          addStock,
        });
        if (res.data?.success) {
          toast.success(`Batch ${res.data.data.batchNumber} registered${addStock ? ' and added to stock' : ''}`);
          onSuccess();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to register');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>{mode === 'serials' ? 'Register Serial Numbers' : 'Register Batch'}</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          For opening stock or stock that predates tracking. Receiving a purchase order records these automatically.
        </p>
        {eligible.length === 0 ? (
          <>
            <p style={{ color: '#64748B', padding: '8px 0' }}>
              No {mode === 'serials' ? 'serial' : 'batch'}-tracked products yet — set a product's tracking type on the product form first.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Product *</label>
              <select className="form-select" value={productId} required onChange={e => setProductId(e.target.value)}>
                <option value="">Select product...</option>
                {eligible.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>

            {mode === 'serials' ? (
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label">Serial numbers * (one per line, or comma-separated)</label>
                <textarea className="form-textarea" rows="5" value={serialText}
                  onChange={e => setSerialText(e.target.value)} placeholder={'SN-0001\nSN-0002\nSN-0003'} />
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Batch number *</label>
                    <input className="form-input" required value={batchForm.batchNumber}
                      onChange={e => setBatchForm(f => ({ ...f, batchNumber: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantity *</label>
                    <input className="form-input" type="number" min="1" required value={batchForm.quantity}
                      onChange={e => setBatchForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '12px', maxWidth: '220px' }}>
                  <label className="form-label">Expiry date</label>
                  <input className="form-input" type="date" value={batchForm.expiryDate}
                    onChange={e => setBatchForm(f => ({ ...f, expiryDate: e.target.value }))} />
                </div>
              </>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={addStock} onChange={e => setAddStock(e.target.checked)} />
              Also add to stock count (leave off if this stock is already counted)
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Register'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TrackingPage;
