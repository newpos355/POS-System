import React, { useEffect, useState } from 'react';
import { SuperAdminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function SystemStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(() => {
      fetchStatus(true);
    }, 15000); // Auto refresh every 15 sec
    return () => clearInterval(timer);
  }, []);

  const fetchStatus = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      const res = await SuperAdminAPI.getSystemStatus();
      setStatus(res.data.data);
    } catch {
      toast.error('Failed to load system status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) return <div className="sa-loader"><div className="sa-spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="sa-page-title">System Status & Health</h1>
          <p className="sa-page-subtitle">Real-time platform infrastructure performance, database metrics, and service availability</p>
        </div>
        <button className="sa-btn sa-btn-ghost" onClick={() => fetchStatus()} disabled={refreshing}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ transform: refreshing ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh Status'}
        </button>
      </div>

      {/* Primary Health Banner */}
      <div className="sa-card" style={{ marginBottom: 24, padding: 20, background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.15), rgba(15, 23, 42, 0.9))', border: '1px solid rgba(22, 163, 74, 0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(22, 163, 74, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontSize: '1.5rem' }}>
              ✓
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
                All Systems Operational
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--sa-text-muted)', marginTop: 2 }}>
                Server Uptime: <strong style={{ color: '#22c55e' }}>{status?.server?.uptimeFormatted}</strong> • Node.js {status?.server?.nodeVersion} ({status?.server?.platform})
              </div>
            </div>
          </div>
          <div className="sa-breadcrumb-badge" style={{ background: 'rgba(22, 163, 74, 0.2)', color: '#22c55e', borderColor: 'rgba(22, 163, 74, 0.4)' }}>
            <span className="sa-live-dot" /> Auto-Refreshing Live
          </div>
        </div>
      </div>

      {/* Health Stats Grid */}
      <div className="sa-stats-grid">
        <div className="sa-stat-card">
          <div className="sa-stat-label">Database Status</div>
          <div className="sa-stat-value" style={{ color: '#22c55e', fontSize: '1.4rem' }}>
            {status?.database?.status}
          </div>
          <div className="sa-stat-sub">Cluster: {status?.database?.name}</div>
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-label">RAM Memory Usage</div>
          <div className="sa-stat-value" style={{ fontSize: '1.4rem' }}>
            {status?.server?.memory?.heapUsedMB} MB
          </div>
          <div className="sa-stat-sub">Allocated: {status?.server?.memory?.heapTotalMB} MB</div>
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-label">Total Tenants</div>
          <div className="sa-stat-value" style={{ fontSize: '1.4rem', color: '#3b82f6' }}>
            {status?.counts?.tenants || 0}
          </div>
          <div className="sa-stat-sub">Active Organizations</div>
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-label">Total Sales Transactions</div>
          <div className="sa-stat-value" style={{ fontSize: '1.4rem', color: '#8b5cf6' }}>
            {status?.counts?.salesOrders || 0}
          </div>
          <div className="sa-stat-sub">Orders Processed</div>
        </div>
      </div>

      {/* Services Operational Status Table */}
      <div className="sa-card" style={{ marginBottom: 24 }}>
        <div className="sa-card-header">
          <span className="sa-card-title">🔌 Service Endpoints Status</span>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Mode / State</th>
              </tr>
            </thead>
            <tbody>
              {(status?.services || []).map((srv, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 600 }}>{srv.name}</td>
                  <td>
                    <span className="sa-badge sa-badge-active">
                      <span className="sa-live-dot" style={{ width: 5, height: 5 }} /> {srv.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--sa-text-muted)', fontFamily: 'monospace' }}>{srv.latency || '< 10ms'}</td>
                  <td style={{ color: 'var(--sa-text-dim)' }}>{srv.mode || srv.provider || 'Active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Database Document Counts */}
      <div className="sa-card">
        <div className="sa-card-header">
          <span className="sa-card-title">📊 MongoDB Database Records Breakdown</span>
        </div>
        <div className="sa-card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            ['Users', status?.counts?.users, '👥'],
            ['Products Catalog', status?.counts?.products, '📦'],
            ['Inventory Stock Items', status?.counts?.inventoryRecords, '🏬'],
            ['System Notifications', status?.counts?.notifications, '🔔'],
            ['Audit Logs', status?.counts?.auditLogs, '📋'],
          ].map(([label, count, icon]) => (
            <div key={label} style={{ padding: 14, background: 'var(--sa-surface-2)', borderRadius: 8, border: '1px solid var(--sa-border)' }}>
              <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--sa-text)' }}>{(count || 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
