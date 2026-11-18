import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft, FiPrinter, FiCheckCircle, FiXCircle, FiPlus, FiMinus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { PicklistsAPI } from '../../services/api';
import { printPicklist } from './fulfillmentPrint';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_BADGE = {
  open: <span className="badge badge-default">Open</span>,
  in_progress: <span className="badge badge-info">In Progress</span>,
  picked: <span className="badge badge-success">Picked</span>,
  cancelled: <span className="badge badge-danger">Cancelled</span>,
};

const PicklistDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = ['admin', 'manager'].includes((user?.role || '').toLowerCase());
  const [picklist, setPicklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const scanRef = useRef(null);

  useEffect(() => {
    fetchPicklist();
  }, [id]);

  const fetchPicklist = async () => {
    try {
      setLoading(true);
      const res = await PicklistsAPI.getPicklist(id);
      if (res.data?.success) setPicklist(res.data.data);
    } catch (error) {
      toast.error('Failed to load picklist');
    } finally {
      setLoading(false);
    }
  };

  const editable = picklist && ['open', 'in_progress'].includes(picklist.status);

  const setPicked = (itemId, value) => {
    setPicklist(prev => ({
      ...prev,
      items: prev.items.map(i => i._id === itemId
        ? { ...i, pickedQty: Math.min(Math.max(0, value), i.requestedQty) }
        : i),
    }));
  };

  // Scan-to-pick: typing/scanning a barcode or SKU into the box increments
  // that item's picked count by one.
  const handleScan = (e) => {
    e.preventDefault();
    const code = scanValue.trim().toLowerCase();
    setScanValue('');
    if (!code) return;
    const item = picklist.items.find(i =>
      (i.barcode || '').toLowerCase() === code || (i.sku || '').toLowerCase() === code);
    if (!item) {
      toast.error(`No line matches "${code}"`);
      return;
    }
    if (item.pickedQty >= item.requestedQty) {
      toast.error(`"${item.name}" is already fully picked`);
      return;
    }
    setPicked(item._id, item.pickedQty + 1);
    toast.success(`${item.name}: ${item.pickedQty + 1}/${item.requestedQty}`);
  };

  const saveProgress = async () => {
    setSaving(true);
    try {
      const res = await PicklistsAPI.updateItems(id, {
        items: picklist.items.map(i => ({ itemId: i._id, pickedQty: i.pickedQty })),
      });
      if (res.data?.success) {
        setPicklist(res.data.data);
        toast.success('Progress saved');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save progress');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    const short = picklist.items.filter(i => i.pickedQty < i.requestedQty);
    const msg = short.length > 0
      ? `${short.length} line(s) are not fully picked. Complete anyway with the current quantities?`
      : 'Complete this picklist? Picked quantities will be written back to the order.';
    if (!window.confirm(msg)) return;
    setSaving(true);
    try {
      const res = await PicklistsAPI.completePicklist(id, {
        items: picklist.items.map(i => ({ itemId: i._id, pickedQty: i.pickedQty })),
      });
      if (res.data?.success) {
        setPicklist(res.data.data);
        toast.success('Picklist completed');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to complete picklist');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this picklist?')) return;
    try {
      const res = await PicklistsAPI.cancelPicklist(id);
      if (res.data?.success) {
        setPicklist(res.data.data);
        toast.success('Picklist cancelled');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel picklist');
    }
  };

  if (loading) return (
    <div className="page-container">
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading...</div>
    </div>
  );
  if (!picklist) return (
    <div className="page-container">
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Picklist not found</div>
    </div>
  );

  const totalRequested = picklist.items.reduce((s, i) => s + i.requestedQty, 0);
  const totalPicked = picklist.items.reduce((s, i) => s + i.pickedQty, 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/picklists')}>
            <FiArrowLeft /> Back
          </button>
          <h1 className="page-title">{picklist.picklistNumber}</h1>
          {STATUS_BADGE[picklist.status] || picklist.status}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-outline" onClick={() => printPicklist(picklist)}>
            <FiPrinter /> Print Pick Sheet
          </button>
          {editable && canManage && (
            <>
              <button className="btn btn-danger" onClick={handleCancel}>
                <FiXCircle /> Cancel
              </button>
              <button className="btn btn-primary" onClick={handleComplete} disabled={saving}>
                <FiCheckCircle /> Complete Picklist
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '8px', fontSize: '14px', color: '#64748B' }}>Order(s)</h4>
          {(picklist.salesOrderIds || []).map((soId, idx) => (
            <p key={String(soId)}>
              <Link to={`/sales/${soId}`} style={{ fontWeight: 600 }}>
                {(picklist.orderNumbers || [])[idx] || 'View order'}
              </Link>
            </p>
          ))}
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '8px', fontSize: '14px', color: '#64748B' }}>Progress</h4>
          <p style={{ fontSize: '22px', fontWeight: 700 }}>{totalPicked} / {totalRequested} <span style={{ fontSize: '13px', fontWeight: 400, color: '#64748B' }}>units picked</span></p>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '8px', fontSize: '14px', color: '#64748B' }}>Details</h4>
          <p><strong>Created:</strong> {new Date(picklist.createdAt).toLocaleString()}</p>
          {picklist.assignedTo?.name && <p><strong>Assigned:</strong> {picklist.assignedTo.name}</p>}
          {picklist.completedAt && <p><strong>Completed:</strong> {new Date(picklist.completedAt).toLocaleString()}</p>}
        </div>
      </div>

      {editable && (
        <form onSubmit={handleScan} className="card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            ref={scanRef}
            className="form-input"
            style={{ maxWidth: '360px' }}
            placeholder="Scan or type a barcode / SKU, then press Enter (+1 each scan)"
            value={scanValue}
            onChange={e => setScanValue(e.target.value)}
          />
          <button type="submit" className="btn btn-outline">Pick +1</button>
          <button type="button" className="btn btn-primary" onClick={saveProgress} disabled={saving}>
            {saving ? 'Saving...' : 'Save Progress'}
          </button>
        </form>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th>Barcode</th>
              <th style={{ textAlign: 'center' }}>Requested</th>
              <th style={{ textAlign: 'center', width: '180px' }}>Picked</th>
            </tr>
          </thead>
          <tbody>
            {picklist.items.map(item => (
              <tr key={item._id} style={item.pickedQty >= item.requestedQty ? { background: '#F0FDF4' } : {}}>
                <td><strong>{item.name}</strong></td>
                <td>{item.sku || '-'}</td>
                <td>{item.barcode || '-'}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.requestedQty}</td>
                <td style={{ textAlign: 'center' }}>
                  {editable ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setPicked(item._id, item.pickedQty - 1)}><FiMinus /></button>
                      <span style={{ minWidth: '40px', fontWeight: 700 }}>{item.pickedQty}</span>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setPicked(item._id, item.pickedQty + 1)}><FiPlus /></button>
                    </div>
                  ) : (
                    <strong>{item.pickedQty}</strong>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PicklistDetail;
