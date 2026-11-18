import React, { useEffect, useState } from 'react';
import { SuperAdminAPI } from '../../services/api';
import toast from 'react-hot-toast';

const StatCard = ({ icon, label, value, sub, color }) => (
  <div className="sa-stat-card">
    <div className="sa-stat-icon" style={{ background: color + '22' }}>
      <span style={{ color }}>{icon}</span>
    </div>
    <div className="sa-stat-value">{value}</div>
    <div className="sa-stat-label">{label}</div>
    {sub && <div className="sa-stat-sub">{sub}</div>}
  </div>
);

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await SuperAdminAPI.getStats();
      setStats(res.data.data);
    } catch {
      toast.error('Failed to load platform stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="sa-loader"><div className="sa-spinner" /></div>;
  }

  const planColors = {
    none: '#64748b', free: '#94a3b8',
    starter: '#3b82f6', business: '#10b981', enterprise: '#8b5cf6',
  };

  const formatMRR = (v) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${v}`;
  };

  const planBD = {};
  (stats?.planBreakdown || []).forEach(p => { planBD[p._id] = p.count; });

  return (
    <div style={{ animation: 'saPageEnter 0.3s ease' }}>
      <style>{`@keyframes saPageEnter { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>

      {/* Header */}
      <div className="sa-page-header">
        <h1 className="sa-page-title">Platform Overview</h1>
        <p className="sa-page-subtitle">Real-time metrics across all tenant businesses</p>
      </div>

      {/* KPI Grid */}
      <div className="sa-stats-grid">
        <StatCard
          icon={<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>}
          label="Total Tenants"
          value={stats?.totalTenants ?? 0}
          sub={`${stats?.activeTenants ?? 0} active`}
          color="#10b981"
        />
        <StatCard
          icon={<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          label="Est. MRR"
          value={formatMRR(stats?.mrr ?? 0)}
          sub="Monthly Recurring Revenue"
          color="#34d399"
        />
        <StatCard
          icon={<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>}
          label="Total Users"
          value={stats?.totalUsers ?? 0}
          sub="Across all tenants"
          color="#f59e0b"
        />
        <StatCard
          icon={<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
          label="New Signups (7d)"
          value={stats?.newSignups7d ?? 0}
          sub="Last 7 days"
          color="#8b5cf6"
        />
        <StatCard
          icon={<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
          label="Suspended"
          value={stats?.suspendedTenants ?? 0}
          sub="Accounts suspended"
          color="#ef4444"
        />
      </div>

      {/* Subscription Breakdown + Recent Tenants */}
      <div className="sa-grid-2" style={{ gap: '20px', marginBottom: '24px' }}>
        {/* Plan Breakdown */}
        <div className="sa-card">
          <div className="sa-card-header">
            <span className="sa-card-title">Subscription Breakdown</span>
          </div>
          <div className="sa-card-body">
            {['enterprise', 'business', 'starter', 'free', 'none'].map(plan => {
              const count = planBD[plan] || 0;
              const total = stats?.totalTenants || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={plan} style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--sa-text)', textTransform: 'capitalize' }}>
                      {plan === 'none' ? 'No Plan' : plan}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--sa-text-muted)' }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--sa-surface-2)', borderRadius: '100px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: planColors[plan] || '#64748b',
                      borderRadius: '100px',
                      transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Tenants */}
        <div className="sa-card">
          <div className="sa-card-header">
            <span className="sa-card-title">Recent Sign-ups</span>
            <a href="/super-admin/tenants" style={{ fontSize: '0.78rem', color: 'var(--sa-primary)', textDecoration: 'none', fontWeight: 600 }}>
              View All →
            </a>
          </div>
          <div style={{ overflow: 'hidden' }}>
            {(stats?.recentTenants || []).length === 0 ? (
              <div className="sa-empty">
                <div className="sa-empty-icon">🏢</div>
                <span style={{ fontSize: '0.875rem' }}>No tenants yet</span>
              </div>
            ) : (
              (stats?.recentTenants || []).map(t => (
                <div key={t._id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--sa-border)',
                }}>
                  <div style={{
                    width: 34, height: 34,
                    background: 'linear-gradient(135deg, var(--sa-primary), var(--sa-primary-dark))',
                    borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.85rem', fontWeight: 700, color: 'white',
                    flexShrink: 0,
                  }}>
                    {t.name[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--sa-text-dim)' }}>{t.email}</div>
                  </div>
                  <span className={`sa-badge sa-badge-${t.plan}`}>{t.plan || 'none'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* System Status Bar */}
      <div className="sa-card">
        <div className="sa-card-header">
          <span className="sa-card-title">System Status</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--sa-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sa-success)', display: 'inline-block' }} />
            All Systems Operational
          </span>
        </div>
        <div className="sa-card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
            {[
              { name: 'API Server', status: 'Operational', ok: true },
              { name: 'Database', status: 'Connected', ok: true },
              { name: 'Auth Service', status: 'Operational', ok: true },
              { name: 'POS Terminal', status: 'Operational', ok: true },
            ].map(svc => (
              <div key={svc.name} style={{
                padding: '12px 14px',
                background: 'var(--sa-surface-2)',
                borderRadius: '8px',
                border: `1px solid ${svc.ok ? 'var(--sa-success-bg)' : 'var(--sa-danger-bg)'}`,
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--sa-text-muted)', marginBottom: 4 }}>{svc.name}</div>
                <div style={{
                  fontSize: '0.82rem', fontWeight: 600,
                  color: svc.ok ? 'var(--sa-success)' : 'var(--sa-danger)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: svc.ok ? 'var(--sa-success)' : 'var(--sa-danger)', display: 'inline-block' }} />
                  {svc.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
