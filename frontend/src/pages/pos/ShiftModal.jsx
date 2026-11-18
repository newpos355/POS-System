import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ShiftsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { getActiveBranchId } from '../../utils/branch';

// Drawer/shift management: open with a float, watch live expected cash,
// record cash in/out, close against a physical count. Expected cash is
// derived server-side from the sales ledger, so it always agrees with the
// books.
const ShiftModal = ({ shift, onChanged, onClose }) => {
  const [current, setCurrent] = useState(shift);
  const [loading, setLoading] = useState(!shift);
  const [busy, setBusy] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('');
  const [movement, setMovement] = useState({ type: 'cash_out', amount: '', reason: '' });
  const [countedCash, setCountedCash] = useState('');
  const [closing, setClosing] = useState(false);
  const [closedSummary, setClosedSummary] = useState(null);

  const refresh = () => {
    setLoading(true);
    ShiftsAPI.getCurrent()
      .then(res => { if (res.data?.success) { setCurrent(res.data.data); onChanged?.(res.data.data); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const handleOpen = async (e) => {
    e.preventDefault();
    const flt = parseFloat(openingFloat);
    if (!Number.isFinite(flt) || flt < 0) return toast.error('Enter the opening float (0 is allowed)');
    setBusy(true);
    try {
      const res = await ShiftsAPI.openShift({
        openingFloat: flt,
        branchId: getActiveBranchId() || undefined,
      });
      if (res.data?.success) {
        toast.success(`Shift ${res.data.data.sessionNumber} opened`);
        refresh();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to open shift');
    } finally {
      setBusy(false);
    }
  };

  const handleMovement = async (e) => {
    e.preventDefault();
    const amt = parseFloat(movement.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');
    setBusy(true);
    try {
      const res = await ShiftsAPI.addMovement(current._id, { ...movement, amount: amt });
      if (res.data?.success) {
        toast.success(movement.type === 'cash_in' ? 'Cash added to drawer' : 'Cash taken out of drawer');
        setMovement({ type: 'cash_out', amount: '', reason: '' });
        refresh();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record movement');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (e) => {
    e.preventDefault();
    const counted = parseFloat(countedCash);
    if (!Number.isFinite(counted) || counted < 0) return toast.error('Enter the counted cash amount');
    if (!window.confirm('Close this shift? This finalizes the cash count.')) return;
    setBusy(true);
    try {
      const res = await ShiftsAPI.closeShift(current._id, { countedCash: counted });
      if (res.data?.success) {
        setClosedSummary(res.data.data);
        setCurrent(null);
        onChanged?.(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to close shift');
    } finally {
      setBusy(false);
    }
  };

  const t = current?.liveTotals;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        {closedSummary ? (
          <>
            <h2 style={{ marginBottom: '12px' }}>Shift {closedSummary.sessionNumber} Closed</h2>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', fontSize: '14px', marginBottom: '16px' }}>
              <Row label="Opening float" value={formatCurrency(closedSummary.openingFloat || 0)} />
              <Row label="Cash sales" value={formatCurrency(closedSummary.totals?.cashSales || 0)} />
              <Row label="Due-bill collections" value={formatCurrency(closedSummary.totals?.cashCollections || 0)} />
              <Row label="Cash in / out" value={`+${formatCurrency(closedSummary.totals?.cashIn || 0)} / -${formatCurrency(closedSummary.totals?.cashOut || 0)}`} />
              <Row label="Cash refunds" value={`-${formatCurrency(closedSummary.totals?.cashRefunds || 0)}`} />
              <hr style={{ border: 'none', borderTop: '1px dashed #CBD5E1', margin: '8px 0' }} />
              <Row label="Expected cash" value={formatCurrency(closedSummary.expectedCash || 0)} bold />
              <Row label="Counted cash" value={formatCurrency(closedSummary.countedCash || 0)} bold />
              <Row
                label={closedSummary.overShort >= 0 ? 'Over' : 'Short'}
                value={formatCurrency(Math.abs(closedSummary.overShort || 0))}
                color={Math.abs(closedSummary.overShort || 0) < 0.01 ? '#16A34A' : closedSummary.overShort > 0 ? '#D97706' : '#DC2626'}
                bold
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>Loading…</div>
        ) : !current ? (
          <>
            <h2 style={{ marginBottom: '4px' }}>Open Shift</h2>
            <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>
              Count the cash in the drawer before selling — that's your opening float.
            </p>
            <form onSubmit={handleOpen}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Opening float *</label>
                <input className="form-input" type="number" min="0" step="any" autoFocus
                  style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
                  value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Opening…' : 'Open Shift'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: '4px' }}>Shift {current.sessionNumber}</h2>
            <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '14px' }}>
              Open since {new Date(current.openedAt).toLocaleString()}
            </p>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', fontSize: '14px', marginBottom: '14px' }}>
              <Row label="Opening float" value={formatCurrency(current.openingFloat || 0)} />
              <Row label={`Cash sales (${t?.salesCount ?? 0} sale(s))`} value={formatCurrency(t?.cashSales || 0)} />
              {(t?.cashCollections || 0) > 0 && <Row label="Due-bill collections" value={formatCurrency(t.cashCollections)} />}
              {(t?.cashIn || 0) > 0 && <Row label="Cash in" value={`+${formatCurrency(t.cashIn)}`} />}
              {(t?.cashOut || 0) > 0 && <Row label="Cash out" value={`-${formatCurrency(t.cashOut)}`} />}
              {(t?.cashRefunds || 0) > 0 && <Row label="Cash refunds" value={`-${formatCurrency(t.cashRefunds)}`} />}
              <hr style={{ border: 'none', borderTop: '1px dashed #CBD5E1', margin: '8px 0' }} />
              <Row label="Expected in drawer" value={formatCurrency(current.liveExpectedCash || 0)} bold />
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>
                Other tenders: card {formatCurrency(t?.cardSales || 0)} · mobile {formatCurrency(t?.mobileSales || 0)} · credit {formatCurrency(t?.creditSales || 0)}
              </div>
            </div>

            {!closing ? (
              <>
                <form onSubmit={handleMovement} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <select className="form-select" style={{ width: '120px' }} value={movement.type}
                    onChange={e => setMovement(m => ({ ...m, type: e.target.value }))}>
                    <option value="cash_out">Cash out</option>
                    <option value="cash_in">Cash in</option>
                  </select>
                  <input className="form-input" type="number" min="0" step="any" placeholder="Amount"
                    style={{ width: '110px' }}
                    value={movement.amount} onChange={e => setMovement(m => ({ ...m, amount: e.target.value }))} />
                  <input className="form-input" placeholder="Reason (e.g. bank drop)"
                    value={movement.reason} onChange={e => setMovement(m => ({ ...m, reason: e.target.value }))} />
                  <button type="submit" className="btn btn-outline" disabled={busy}>Save</button>
                </form>
                {(current.movements || []).length > 0 && (
                  <div style={{ maxHeight: '110px', overflow: 'auto', marginBottom: '14px', fontSize: '13px' }}>
                    {[...current.movements].reverse().map((m, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#475569' }}>
                        <span>{m.type === 'cash_in' ? '↓ In' : '↑ Out'} — {m.reason || 'No reason'}</span>
                        <strong style={{ color: m.type === 'cash_in' ? '#16A34A' : '#DC2626' }}>
                          {m.type === 'cash_in' ? '+' : '-'}{formatCurrency(m.amount)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <button className="btn btn-danger" onClick={() => setClosing(true)}>Close Shift…</button>
                  <button className="btn btn-outline" onClick={onClose}>Done</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleClose}>
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label">Counted cash in drawer *</label>
                  <input className="form-input" type="number" min="0" step="any" autoFocus
                    style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
                    value={countedCash} onChange={e => setCountedCash(e.target.value)} />
                  {countedCash !== '' && Number.isFinite(parseFloat(countedCash)) && (
                    <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '13px', fontWeight: 700, color: Math.abs(parseFloat(countedCash) - (current.liveExpectedCash || 0)) < 0.01 ? '#16A34A' : parseFloat(countedCash) > (current.liveExpectedCash || 0) ? '#D97706' : '#DC2626' }}>
                      {Math.abs(parseFloat(countedCash) - (current.liveExpectedCash || 0)) < 0.01
                        ? '✓ Balanced'
                        : parseFloat(countedCash) > (current.liveExpectedCash || 0)
                          ? `Over by ${formatCurrency(parseFloat(countedCash) - (current.liveExpectedCash || 0))}`
                          : `Short by ${formatCurrency((current.liveExpectedCash || 0) - parseFloat(countedCash))}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setClosing(false)}>Back</button>
                  <button type="submit" className="btn btn-danger" disabled={busy}>
                    {busy ? 'Closing…' : 'Confirm & Close Shift'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const Row = ({ label, value, bold, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: bold ? 700 : 400, color: color || 'inherit' }}>
    <span>{label}</span><span>{value}</span>
  </div>
);

export default ShiftModal;
