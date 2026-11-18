import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/currency';

// Weight entry for sold-by-weight products. Two paths to a number:
// type it, or read it from a serial-connected scale via the Web Serial API
// (Chrome/Edge; most bench scales stream their reading as plain text over
// RS-232/USB-serial). The parsed weight becomes the line quantity, and the
// product's price is treated as price-per-unit-of-weight.
const WeightModal = ({ product, initialWeight, onConfirm, onClose }) => {
  const [weight, setWeight] = useState(initialWeight || '');
  const [reading, setReading] = useState(false);
  const readerRef = useRef(null);
  const portRef = useRef(null);

  const unit = product.unit && product.unit !== 'piece' ? product.unit : 'kg';
  const parsed = parseFloat(weight);
  const valid = Number.isFinite(parsed) && parsed > 0;

  const stopReading = async () => {
    setReading(false);
    try { await readerRef.current?.cancel(); } catch { /* already closed */ }
    try { await portRef.current?.close(); } catch { /* already closed */ }
    readerRef.current = null;
    portRef.current = null;
  };

  useEffect(() => () => { stopReading(); }, []);

  const readFromScale = async () => {
    if (!('serial' in navigator)) {
      toast.error('Scale reading needs Chrome or Edge (Web Serial API). Enter the weight manually.');
      return;
    }
    try {
      setReading(true);
      const port = await navigator.serial.requestPort();
      portRef.current = port;
      await port.open({ baudRate: 9600 });
      const reader = port.readable.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        // Most scales emit lines like "ST,GS,+  0.735kg" — grab the first
        // plausible decimal number.
        const match = buffer.match(/(\d+[.,]\d+|\d+)/);
        if (match) {
          const w = parseFloat(match[1].replace(',', '.'));
          if (Number.isFinite(w) && w > 0) {
            setWeight(String(w));
            toast.success(`Scale: ${w} ${unit}`);
            break;
          }
          buffer = '';
        }
        if (buffer.length > 200) buffer = buffer.slice(-50);
      }
    } catch (err) {
      if (err?.name !== 'NotFoundError') { // NotFoundError = user closed the picker
        toast.error('Could not read from the scale — check the connection, or enter the weight manually.');
      }
    } finally {
      await stopReading();
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return toast.error('Enter a valid weight');
    onConfirm(Math.round(parsed * 1000) / 1000);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '380px', width: '100%', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>⚖️ Weigh Item</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          {product.name} — {formatCurrency(product.price)} / {unit}
        </p>
        <form onSubmit={submit}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              className="form-input"
              type="number"
              step="0.001"
              min="0.001"
              placeholder={`Weight in ${unit}`}
              value={weight}
              onChange={e => setWeight(e.target.value)}
              autoFocus
              style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
            />
            <button type="button" className="btn btn-outline" onClick={readFromScale} disabled={reading}>
              {reading ? 'Reading…' : '⚖️ Read Scale'}
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: '15px', marginBottom: '16px', color: '#334155' }}>
            {valid
              ? <><strong>{parsed} {unit}</strong> × {formatCurrency(product.price)} = <strong style={{ color: '#16A34A' }}>{formatCurrency(parsed * product.price)}</strong></>
              : <span style={{ color: '#94A3B8' }}>Enter or read a weight</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!valid}>Add to Cart</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WeightModal;
