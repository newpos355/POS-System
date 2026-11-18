import React, { useState } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/currency';

const TENDER_METHODS = ['Cash', 'Card', 'Airtel Money', 'MTN MoMo', 'Bank Transfer', 'Other'];

// Split a bill across several tenders (part cash + part card + ...). The
// server re-validates: tenders must cover the total, and change can only be
// given out of the cash tender.
const SplitTenderModal = ({ total, onConfirm, onClose }) => {
  const [tenders, setTenders] = useState([
    { method: 'Cash', amount: '', reference: '' },
    { method: 'Card', amount: '', reference: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const sum = tenders.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const remaining = Math.max(0, total - sum);
  const cashTender = tenders.filter(t => t.method === 'Cash')
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const change = Math.max(0, sum - total);

  const setTender = (idx, patch) => {
    setTenders(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  };

  const fillRemaining = (idx) => {
    setTender(idx, { amount: String(Math.round(remaining * 100) / 100 + (parseFloat(tenders[idx].amount) || 0)) });
  };

  const submit = (e) => {
    e.preventDefault();
    const lines = tenders
      .map(t => ({ method: t.method, amount: parseFloat(t.amount) || 0, reference: t.reference || undefined }))
      .filter(t => t.amount > 0);
    if (lines.length < 2) return toast.error('A split needs at least two tenders with amounts');
    if (sum < total - 0.01) return toast.error(`Tenders are ${formatCurrency(total - sum)} short of the total`);
    if (change > cashTender + 0.01) return toast.error('Change can only be given from the cash tender');
    setSaving(true);
    onConfirm(lines);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '460px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '4px' }}>Split Payment</h2>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
          Total due: <strong style={{ color: '#0F172A' }}>{formatCurrency(total)}</strong>
        </p>
        <form onSubmit={submit}>
          {tenders.map((t, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <select className="form-select" style={{ width: '140px' }} value={t.method}
                onChange={e => setTender(idx, { method: e.target.value })}>
                {TENDER_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input className="form-input" type="number" min="0" step="any" placeholder="Amount"
                value={t.amount} onChange={e => setTender(idx, { amount: e.target.value })} />
              <button type="button" className="btn btn-outline btn-sm" title="Fill remaining"
                onClick={() => fillRemaining(idx)}>⤓</button>
              {t.method !== 'Cash' && (
                <input className="form-input" style={{ width: '110px' }} placeholder="Ref #"
                  value={t.reference} onChange={e => setTender(idx, { reference: e.target.value })} />
              )}
              {tenders.length > 2 && (
                <button type="button" className="btn btn-danger btn-sm"
                  onClick={() => setTenders(prev => prev.filter((_, i) => i !== idx))}>
                  <FiTrash2 />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" style={{ marginBottom: '14px' }}
            onClick={() => setTenders(prev => [...prev, { method: 'Cash', amount: '', reference: '' }])}>
            <FiPlus /> Add Tender
          </button>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tendered</span><strong>{formatCurrency(sum)}</strong>
            </div>
            {remaining > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DC2626' }}>
                <span>Remaining</span><strong>{formatCurrency(remaining)}</strong>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A' }}>
                <span>Change (from cash)</span><strong>{formatCurrency(change)}</strong>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || remaining > 0.01}>
              {saving ? 'Processing…' : `Complete Payment`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SplitTenderModal;
