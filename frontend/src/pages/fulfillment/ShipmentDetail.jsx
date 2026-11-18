import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FiArrowLeft, FiPrinter, FiTruck, FiXCircle, FiFileText, FiEdit2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ShipmentsAPI, WaybillsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { printShippingLabel } from './labelPrint';
import { printWaybill } from './fulfillmentPrint';
import { SHIPMENT_STATUS_BADGE } from './ShipmentList';
import { useAuth } from '../../contexts/AuthContext';

const ShipmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = ['admin', 'manager'].includes((user?.role || '').toLowerCase());
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCarrierForm, setShowCarrierForm] = useState(false);
  const [carrier, setCarrier] = useState({ name: '', service: '', trackingNumber: '', trackingUrl: '' });
  const [showWaybillForm, setShowWaybillForm] = useState(false);
  const [waybill, setWaybill] = useState(null);

  useEffect(() => {
    fetchShipment();
  }, [id]);

  const fetchShipment = async () => {
    try {
      setLoading(true);
      const res = await ShipmentsAPI.getShipment(id);
      if (res.data?.success) {
        setShipment(res.data.data);
        setCarrier(res.data.data.carrier || { name: '', service: '', trackingNumber: '', trackingUrl: '' });
      }
      // Show an existing waybill for this shipment if one was already issued.
      const wbRes = await WaybillsAPI.getWaybills({ shipmentId: id }).catch(() => null);
      if (wbRes?.data?.success && wbRes.data.data.length > 0) {
        setWaybill(wbRes.data.data.find(w => w.status !== 'cancelled') || wbRes.data.data[0]);
      }
    } catch (error) {
      toast.error('Failed to load shipment');
    } finally {
      setLoading(false);
    }
  };

  const saveCarrier = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await ShipmentsAPI.updateShipment(id, { carrier });
      if (res.data?.success) {
        setShipment(res.data.data);
        setShowCarrierForm(false);
        toast.success('Carrier details saved');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save carrier');
    } finally {
      setBusy(false);
    }
  };

  const handleDispatch = async () => {
    if (!window.confirm('Dispatch this shipment? Order lines will be marked as shipped.')) return;
    setBusy(true);
    try {
      const res = await ShipmentsAPI.dispatchShipment(id);
      if (res.data?.success) {
        setShipment(res.data.data);
        toast.success('Shipment dispatched');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to dispatch');
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (status) => {
    setBusy(true);
    try {
      const res = await ShipmentsAPI.updateStatus(id, status);
      if (res.data?.success) {
        setShipment(res.data.data);
        toast.success(`Marked ${status.replace('_', ' ')}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update status');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this shipment? Packed quantities will be released back to the order.')) return;
    setBusy(true);
    try {
      const res = await ShipmentsAPI.cancelShipment(id);
      if (res.data?.success) {
        setShipment(res.data.data);
        toast.success('Shipment cancelled');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  };

  const handlePrintLabel = async (pkg) => {
    await printShippingLabel(shipment, pkg);
    // Best-effort stamp; the label already printed either way.
    ShipmentsAPI.markLabelPrinted(id).then(res => {
      if (res.data?.success) setShipment(res.data.data);
    }).catch(() => {});
  };

  const handlePrintWaybill = async (wb) => {
    let qrDataUrl = null;
    try {
      const QRCode = (await import('qrcode')).default;
      qrDataUrl = await QRCode.toDataURL(
        JSON.stringify({ wb: wb.waybillNumber, from: wb.consignor?.name, to: wb.consignee?.name, value: wb.totalValue }),
        { width: 192, margin: 1 }
      );
    } catch { /* QR is optional on the printout */ }
    printWaybill(wb, { currencyFormat: formatCurrency, qrDataUrl });
  };

  if (loading) return (
    <div className="page-container">
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading...</div>
    </div>
  );
  if (!shipment) return (
    <div className="page-container">
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Shipment not found</div>
    </div>
  );

  const shipTo = shipment.shipToAddress || {};
  const preDispatch = ['draft', 'packed'].includes(shipment.status);
  const trackable = ['dispatched', 'in_transit'].includes(shipment.status);

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/shipments')}>
            <FiArrowLeft /> Back
          </button>
          <h1 className="page-title">{shipment.shipmentNumber}</h1>
          {SHIPMENT_STATUS_BADGE[shipment.status] || shipment.status}
          {shipment.origin === 'vendor' && <span className="badge badge-info">Dropship (vendor origin)</span>}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {canManage && preDispatch && (
            <>
              <button className="btn btn-danger" onClick={handleCancel} disabled={busy}>
                <FiXCircle /> Cancel
              </button>
              <button className="btn btn-primary" onClick={handleDispatch} disabled={busy}>
                <FiTruck /> Dispatch
              </button>
            </>
          )}
          {canManage && trackable && (
            <>
              {shipment.status === 'dispatched' && (
                <button className="btn btn-outline" onClick={() => handleStatus('in_transit')} disabled={busy}>
                  Mark In Transit
                </button>
              )}
              <button className="btn btn-primary" onClick={() => handleStatus('delivered')} disabled={busy}>
                Mark Delivered
              </button>
              <button className="btn btn-outline" onClick={() => handleStatus('returned')} disabled={busy}>
                Mark Returned
              </button>
            </>
          )}
          {canManage && !waybill && shipment.status !== 'cancelled' && (
            <button className="btn btn-outline" onClick={() => setShowWaybillForm(true)}>
              <FiFileText /> Generate Waybill
            </button>
          )}
          {waybill && (
            <button className="btn btn-outline" onClick={() => handlePrintWaybill(waybill)}>
              <FiPrinter /> Print Waybill {waybill.waybillNumber}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B' }}>Ship To</h4>
          <p><strong>{shipTo.name || '-'}</strong></p>
          <p>{shipTo.address || ''}</p>
          {shipTo.city && <p>{shipTo.city}</p>}
          {shipTo.phone && <p>Tel: {shipTo.phone}</p>}
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
            Carrier
            {canManage && !['delivered', 'cancelled'].includes(shipment.status) && (
              <button className="btn btn-outline btn-sm" onClick={() => setShowCarrierForm(s => !s)}>
                <FiEdit2 /> Edit
              </button>
            )}
          </h4>
          {!showCarrierForm ? (
            <>
              <p><strong>{shipment.carrier?.name || 'Self delivery'}</strong> {shipment.carrier?.service ? `— ${shipment.carrier.service}` : ''}</p>
              {shipment.carrier?.trackingNumber && <p>Tracking: {shipment.carrier.trackingNumber}</p>}
              {shipment.shippedAt && <p>Dispatched: {new Date(shipment.shippedAt).toLocaleString()}</p>}
              {shipment.deliveredAt && <p>Delivered: {new Date(shipment.deliveredAt).toLocaleString()}</p>}
            </>
          ) : (
            <form onSubmit={saveCarrier} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input className="form-input" placeholder="Carrier name" value={carrier.name || ''}
                onChange={e => setCarrier(c => ({ ...c, name: e.target.value }))} />
              <input className="form-input" placeholder="Service (e.g. Express)" value={carrier.service || ''}
                onChange={e => setCarrier(c => ({ ...c, service: e.target.value }))} />
              <input className="form-input" placeholder="Tracking number" value={carrier.trackingNumber || ''}
                onChange={e => setCarrier(c => ({ ...c, trackingNumber: e.target.value }))} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Save</button>
            </form>
          )}
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B' }}>Source</h4>
          {shipment.salesOrderId && (
            <p><strong>Order:</strong> <Link to={`/sales/${shipment.salesOrderId}`}>{shipment.orderNumber || 'View order'}</Link></p>
          )}
          {shipment.picklistId && (
            <p><strong>Picklist:</strong> <Link to={`/picklists/${shipment.picklistId._id || shipment.picklistId}`}>{shipment.picklistId.picklistNumber || 'View'}</Link></p>
          )}
          {shipment.vendorId && <p><strong>Vendor:</strong> {shipment.vendorId.name}</p>}
          <p><strong>Created:</strong> {new Date(shipment.createdAt).toLocaleString()}</p>
          {shipment.labelPrintedAt && <p><strong>Label printed:</strong> {new Date(shipment.labelPrintedAt).toLocaleString()}</p>}
        </div>
      </div>

      {(shipment.packages || []).map(pkg => (
        <div key={pkg._id || pkg.packageNumber} className="table-container" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border, #E2E8F0)' }}>
            <strong>
              Package {pkg.packageNumber} of {shipment.packages.length}
              {pkg.weightKg ? ` · ${pkg.weightKg} kg` : ''}{pkg.dimensions ? ` · ${pkg.dimensions}` : ''}
            </strong>
            <button className="btn btn-outline btn-sm" onClick={() => handlePrintLabel(pkg)}>
              <FiPrinter /> Print Label
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Item</th><th>SKU</th><th style={{ textAlign: 'center' }}>Qty</th></tr>
            </thead>
            <tbody>
              {(pkg.items || []).map((pi, i) => (
                <tr key={i}>
                  <td><strong>{pi.name}</strong></td>
                  <td>{pi.sku || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{pi.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showWaybillForm && (
        <WaybillFormModal
          shipment={shipment}
          onClose={() => setShowWaybillForm(false)}
          onCreated={(wb) => { setWaybill(wb); setShowWaybillForm(false); }}
        />
      )}
    </div>
  );
};

// Prefills the waybill from the shipment: consignor = branch, consignee =
// ship-to, goods = package contents.
const WaybillFormModal = ({ shipment, onClose, onCreated }) => {
  const branch = shipment.branchId || {};
  const shipTo = shipment.shipToAddress || {};
  const [form, setForm] = useState({
    consignor: {
      name: branch.name || 'Store',
      phone: branch.phone || '',
      address: [branch.address, branch.city].filter(Boolean).join(', '),
    },
    consignee: {
      name: shipTo.name || '',
      phone: shipTo.phone || '',
      address: [shipTo.address, shipTo.city].filter(Boolean).join(', '),
    },
    transporter: {
      name: shipment.carrier?.name || '',
      contactPhone: '',
      vehicleNumber: '',
      mode: 'road',
    },
    distanceKm: '',
    goods: (shipment.packages || []).flatMap(pkg =>
      (pkg.items || []).map(pi => ({
        description: pi.name,
        quantity: pi.quantity,
        unit: 'piece',
        taxableValue: 0,
        taxAmount: 0,
      }))),
  });
  const [saving, setSaving] = useState(false);

  const setField = (path, value) => {
    setForm(prev => {
      const next = { ...prev };
      const [a, b] = path.split('.');
      if (b) next[a] = { ...next[a], [b]: value };
      else next[a] = value;
      return next;
    });
  };

  const setGoods = (idx, key, value) => {
    setForm(prev => ({
      ...prev,
      goods: prev.goods.map((g, i) => i === idx ? { ...g, [key]: value } : g),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await WaybillsAPI.createWaybill({
        shipmentId: shipment._id,
        salesOrderId: shipment.salesOrderId,
        documentType: shipment.origin === 'vendor' ? 'dropship' : 'sale',
        ...form,
        distanceKm: form.distanceKm || undefined,
      });
      if (res.data?.success) {
        toast.success(`Waybill ${res.data.data.waybillNumber} issued`);
        onCreated(res.data.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to issue waybill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '720px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Generate Waybill</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          Internal transport document for shipment {shipment.shipmentNumber} — not a government e-way-bill filing.
        </p>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <fieldset style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
              <legend style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', padding: '0 6px' }}>CONSIGNOR (FROM)</legend>
              <input className="form-input" style={{ marginBottom: '8px' }} placeholder="Name" required
                value={form.consignor.name} onChange={e => setField('consignor.name', e.target.value)} />
              <input className="form-input" style={{ marginBottom: '8px' }} placeholder="Address"
                value={form.consignor.address} onChange={e => setField('consignor.address', e.target.value)} />
              <input className="form-input" placeholder="Phone"
                value={form.consignor.phone} onChange={e => setField('consignor.phone', e.target.value)} />
            </fieldset>
            <fieldset style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
              <legend style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', padding: '0 6px' }}>CONSIGNEE (TO)</legend>
              <input className="form-input" style={{ marginBottom: '8px' }} placeholder="Name" required
                value={form.consignee.name} onChange={e => setField('consignee.name', e.target.value)} />
              <input className="form-input" style={{ marginBottom: '8px' }} placeholder="Address"
                value={form.consignee.address} onChange={e => setField('consignee.address', e.target.value)} />
              <input className="form-input" placeholder="Phone"
                value={form.consignee.phone} onChange={e => setField('consignee.phone', e.target.value)} />
            </fieldset>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <input className="form-input" placeholder="Transporter / driver name"
              value={form.transporter.name} onChange={e => setField('transporter.name', e.target.value)} />
            <input className="form-input" placeholder="Vehicle no."
              value={form.transporter.vehicleNumber} onChange={e => setField('transporter.vehicleNumber', e.target.value)} />
            <select className="form-select" value={form.transporter.mode}
              onChange={e => setField('transporter.mode', e.target.value)}>
              <option value="road">Road</option>
              <option value="rail">Rail</option>
              <option value="air">Air</option>
              <option value="ship">Ship</option>
            </select>
            <input className="form-input" type="number" min="0" placeholder="Distance (km)"
              value={form.distanceKm} onChange={e => setField('distanceKm', e.target.value)} />
          </div>

          <table className="data-table" style={{ marginBottom: '16px' }}>
            <thead>
              <tr><th>Goods</th><th style={{ width: '90px' }}>Qty</th><th style={{ width: '130px' }}>Taxable Value</th><th style={{ width: '110px' }}>Tax</th></tr>
            </thead>
            <tbody>
              {form.goods.map((g, i) => (
                <tr key={i}>
                  <td>{g.description}</td>
                  <td>{g.quantity}</td>
                  <td>
                    <input className="form-input" type="number" min="0" step="any" value={g.taxableValue}
                      onChange={e => setGoods(i, 'taxableValue', Number(e.target.value))} />
                  </td>
                  <td>
                    <input className="form-input" type="number" min="0" step="any" value={g.taxAmount}
                      onChange={e => setGoods(i, 'taxAmount', Number(e.target.value))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Issuing...' : 'Issue Waybill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShipmentDetail;
