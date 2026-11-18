import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ShipmentsAPI } from '../../services/api';

// Creates a single-package shipment from a sale: per-line quantities default
// to whatever is still shippable (dropship lines and un-arrived backordered
// shortfall excluded — those ship from the vendor / after replenishment).
const ShipmentModal = ({ sale, onClose, onSuccess }) => {
  const shippableOf = (item) =>
    Math.max(0, Number(item.quantity) - Number(item.cancelledQty || 0)
      - Number(item.shippedQty || 0) - Number(item.backorderedQty || 0)
      - Number(item.packedQty || 0));

  const [lines, setLines] = useState(() =>
    (sale.items || [])
      .filter(item => item.fulfillmentMode !== 'dropship')
      .map(item => ({
        orderItemId: item._id,
        name: item.name,
        sku: item.sku,
        maxQty: shippableOf(item),
        quantity: shippableOf(item),
      }))
      .filter(l => l.maxQty > 0));

  const [shipTo, setShipTo] = useState({
    name: sale.shippingAddress?.name || sale.customerName || sale.customerId?.name || '',
    phone: sale.shippingAddress?.phone || sale.customerId?.phone || '',
    address: sale.shippingAddress?.address || sale.customerId?.address || '',
    city: sale.shippingAddress?.city || '',
  });
  const [carrierName, setCarrierName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [saving, setSaving] = useState(false);

  const setLine = (idx, quantity) => {
    setLines(prev => prev.map((l, i) => i === idx
      ? { ...l, quantity: Math.min(l.maxQty, Math.max(0, quantity)) }
      : l));
  };

  const submit = async (e) => {
    e.preventDefault();
    const items = lines.filter(l => l.quantity > 0)
      .map(l => ({ orderItemId: l.orderItemId, quantity: Number(l.quantity) }));
    if (items.length === 0) { toast.error('Nothing to pack — set at least one quantity'); return; }
    if (!shipTo.address) { toast.error('A delivery address is required'); return; }
    setSaving(true);
    try {
      const res = await ShipmentsAPI.createShipment({
        salesOrderId: sale._id,
        shipToAddress: shipTo,
        carrier: carrierName ? { name: carrierName } : undefined,
        packages: [{
          weightKg: weightKg || undefined,
          dimensions: dimensions || undefined,
          items,
        }],
      });
      if (res.data?.success) {
        toast.success(`Shipment ${res.data.data.shipmentNumber} created`);
        onSuccess?.(res.data.data);
        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create shipment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Create Shipment</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          Pack order {sale.orderNumber} for delivery. More packages can't be added later — create another shipment instead.
        </p>

        {lines.length === 0 ? (
          <>
            <p style={{ color: '#64748B', padding: '12px 0' }}>
              Nothing left to ship on this order — every line is dropship, backordered, cancelled, or already shipped.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
              <div className="form-group">
                <label className="form-label">Deliver to (name) *</label>
                <input className="form-input" required value={shipTo.name}
                  onChange={e => setShipTo(s => ({ ...s, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={shipTo.phone}
                  onChange={e => setShipTo(s => ({ ...s, phone: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '8px' }}>
              <div className="form-group">
                <label className="form-label">Address *</label>
                <input className="form-input" required value={shipTo.address}
                  onChange={e => setShipTo(s => ({ ...s, address: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">City</label>
                <input className="form-input" value={shipTo.city}
                  onChange={e => setShipTo(s => ({ ...s, city: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label className="form-label">Carrier</label>
                <input className="form-input" placeholder="Self delivery" value={carrierName}
                  onChange={e => setCarrierName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Weight (kg)</label>
                <input className="form-input" type="number" min="0" step="any" value={weightKg}
                  onChange={e => setWeightKg(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Dimensions</label>
                <input className="form-input" placeholder="e.g. 40x30x20 cm" value={dimensions}
                  onChange={e => setDimensions(e.target.value)} />
              </div>
            </div>

            <table className="data-table" style={{ marginBottom: '16px' }}>
              <thead>
                <tr><th>Item</th><th style={{ width: '120px' }}>Qty to pack</th></tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={l.orderItemId}>
                    <td>
                      <strong>{l.name}</strong> {l.sku && <span style={{ color: '#64748B', fontSize: '12px' }}>({l.sku})</span>}
                      <span style={{ color: '#94A3B8', fontSize: '12px', marginLeft: '8px' }}>max {l.maxQty}</span>
                    </td>
                    <td>
                      <input type="number" className="form-input" min="0" max={l.maxQty} value={l.quantity}
                        onChange={e => setLine(idx, Number(e.target.value) || 0)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating...' : 'Create Shipment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ShipmentModal;
