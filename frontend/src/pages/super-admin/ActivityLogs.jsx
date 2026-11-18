import React, { useEffect, useState, useCallback } from 'react';
import { SuperAdminAPI } from '../../services/api';
import toast from 'react-hot-toast';

const ACTION_ICONS = {
  login: '🔐', logout: '🚪', create: '✨', update: '✏️',
  delete: '🗑️', sale: '💳', purchase: '📦', void: '❌',
  suspend: '🚫', reactivate: '✅', plan_change: '📋', default: '📝',
};

function getActionIcon(action = '') {
  const lower = action.toLowerCase();
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return ACTION_ICONS.default;
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    page: 1,
    action: '',
    startDate: '',
    endDate: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = { ...filters, limit: 50 };
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const res = await SuperAdminAPI.getActivityLogs(params);
      setLogs(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="sa-page-title">Activity Logs</h1>
          <p className="sa-page-subtitle">Platform-wide audit trail — {pagination.total} events recorded</p>
        </div>
        <button className="sa-btn sa-btn-ghost" onClick={load}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          className="sa-input"
          style={{ flex: '1 1 180px', maxWidth: 220 }}
          placeholder="Filter by action..."
          value={filters.action}
          onChange={e => setFilters(f => ({ ...f, action: e.target.value, page: 1 }))}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--sa-text-muted)', whiteSpace: 'nowrap' }}>From:</label>
          <input
            type="date"
            className="sa-input"
            style={{ flex: '0 0 150px' }}
            value={filters.startDate}
            onChange={e => setFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--sa-text-muted)', whiteSpace: 'nowrap' }}>To:</label>
          <input
            type="date"
            className="sa-input"
            style={{ flex: '0 0 150px' }}
            value={filters.endDate}
            onChange={e => setFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))}
          />
        </div>
        {(filters.action || filters.startDate || filters.endDate) && (
          <button className="sa-btn sa-btn-ghost" onClick={() => setFilters({ page: 1, action: '', startDate: '', endDate: '' })}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Log Table */}
      {loading ? (
        <div className="sa-loader"><div className="sa-spinner" /></div>
      ) : logs.length === 0 ? (
        <div className="sa-card">
          <div className="sa-empty">
            <div className="sa-empty-icon">📋</div>
            <span style={{ fontSize: '0.875rem' }}>No activity logs found</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--sa-text-dim)' }}>
              Activity logs appear as users interact with the platform
            </span>
          </div>
        </div>
      ) : (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>User</th>
                <th>Tenant</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log._id}>
                  <td style={{ color: 'var(--sa-text-dim)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {fmtDate(log.createdAt)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: '1rem' }}>{getActionIcon(log.action)}</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--sa-text)' }}>
                        {log.action || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td>
                    {log.userId ? (
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--sa-text)' }}>{log.userId.name || '—'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--sa-text-dim)' }}>{log.userId.email || ''}</div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--sa-text-dim)', fontSize: '0.8rem' }}>System</span>
                    )}
                  </td>
                  <td>
                    {log.tenantId ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--sa-text-muted)' }}>{log.tenantId.name || '—'}</div>
                    ) : (
                      <span style={{ color: 'var(--sa-text-dim)', fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 220 }}>
                    {log.description ? (
                      <span style={{ fontSize: '0.78rem', color: 'var(--sa-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {log.description}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--sa-text-dim)', fontSize: '0.78rem' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="sa-btn sa-btn-ghost sa-btn-sm" disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>
            ← Prev
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--sa-text-muted)', padding: '4px 12px', display: 'flex', alignItems: 'center' }}>
            Page {filters.page} of {pagination.pages}
          </span>
          <button className="sa-btn sa-btn-ghost sa-btn-sm" disabled={filters.page >= pagination.pages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>
            Next →
          </button>
        </div>
      )}

      {/* Info note */}
      <div className="sa-alert sa-alert-info" style={{ marginTop: 20 }}>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        Activity logs are recorded by the AuditLog model when actions occur across the platform.
      </div>
    </div>
  );
}
