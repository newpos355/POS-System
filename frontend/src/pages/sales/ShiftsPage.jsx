import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiFilter } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ShiftsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';

// Shift/drawer session history. Cashiers see their own sessions;
// admin/manager see everyone's. Sessions are opened and closed from the POS
// terminal's shift button.
const ShiftsPage = () => {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchShifts();
  }, [statusFilter]);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const res = await ShiftsAPI.getShifts(statusFilter ? { status: statusFilter } : {});
      if (res.data?.success) setShifts(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Shift Sessions</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Drawer sessions with cash reconciliation. Open and close shifts from the POS terminal.
          </p>
        </div>
        <Link to="/sales" className="btn btn-outline">All Sales</Link>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiFilter style={{ color: '#64748B' }} />
          <select className="form-select" style={{ width: '200px' }} value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Sessions</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading shifts...</div>
        ) : shifts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            No shift sessions yet. Open one from the POS terminal (the red "Open Shift" button).
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Cashier</th>
                <th>Opened</th>
                <th>Closed</th>
                <th style={{ textAlign: 'right' }}>Float</th>
                <th style={{ textAlign: 'right' }}>Sales</th>
                <th style={{ textAlign: 'right' }}>Expected</th>
                <th style={{ textAlign: 'right' }}>Counted</th>
                <th style={{ textAlign: 'right' }}>Over / Short</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => (
                <tr key={s._id}>
                  <td><strong>{s.sessionNumber}</strong></td>
                  <td>{s.cashierId?.name || '-'}</td>
                  <td>{new Date(s.openedAt).toLocaleString()}</td>
                  <td>{s.closedAt ? new Date(s.closedAt).toLocaleString() : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(s.openingFloat || 0)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {s.totals ? `${s.totals.salesCount || 0} · ${formatCurrency(s.totals.salesTotal || 0)}` : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{s.expectedCash != null ? formatCurrency(s.expectedCash) : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{s.countedCash != null ? formatCurrency(s.countedCash) : '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {s.overShort != null ? (
                      <strong style={{ color: Math.abs(s.overShort) < 0.01 ? '#16A34A' : s.overShort > 0 ? '#D97706' : '#DC2626' }}>
                        {Math.abs(s.overShort) < 0.01 ? '✓ Balanced' : `${s.overShort > 0 ? '+' : ''}${formatCurrency(s.overShort)}`}
                      </strong>
                    ) : '-'}
                  </td>
                  <td>
                    {s.status === 'open'
                      ? <span className="badge badge-success">Open</span>
                      : <span className="badge badge-default">Closed</span>}
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

export default ShiftsPage;
