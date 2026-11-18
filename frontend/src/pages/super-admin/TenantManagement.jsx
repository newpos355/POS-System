import React, { useEffect, useState, useCallback } from 'react';
import { SuperAdminAPI } from '../../services/api';
import toast from 'react-hot-toast';

function TenantDetailModal({ tenantId, onClose, onRefresh }) {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [planForm, setPlanForm] = useState({});
  const [addOnForm, setAddOnForm] = useState({});
  const [statusForm, setStatusForm] = useState({ status: '', reason: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTenant();
  }, [tenantId]);

  const loadTenant = async () => {
    try {
      setLoading(true);
      const res = await SuperAdminAPI.getTenant(tenantId);
      const t = res.data.data;
      setTenant(t);
      setPlanForm({
        plan: t.plan,
        planExpiresAt: t.planExpiresAt ? t.planExpiresAt.split('T')[0] : '',
        trialEndsAt: t.trialEndsAt ? t.trialEndsAt.split('T')[0] : '',
        notes: t.notes || '',
      });
      setAddOnForm({
        extraUsers: t.addOns?.extraUsers || 0,
        extraBranches: t.addOns?.extraBranches || 0,
        smsCredits: t.addOns?.smsCredits || 0,
      });
      setStatusForm({ status: t.status, reason: t.suspendReason || '' });
    } catch {
      toast.error('Failed to load tenant');
    } finally {
      setLoading(false);
    }
  };

  const savePlan = async () => {
    try {
      setSaving(true);
      await SuperAdminAPI.updateTenantPlan(tenantId, planForm);
      toast.success('Plan updated successfully');
      await loadTenant();
      onRefresh();
    } catch { toast.error('Failed to update plan'); }
    finally { setSaving(false); }
  };

  const saveAddOns = async () => {
    try {
      setSaving(true);
      await SuperAdminAPI.updateAddOns(tenantId, addOnForm);
      toast.success('Add-ons updated');
      await loadTenant();
      onRefresh();
    } catch { toast.error('Failed to update add-ons'); }
    finally { setSaving(false); }
  };

  const saveStatus = async () => {
    if (!statusForm.status) return;
    try {
      setSaving(true);
      await SuperAdminAPI.updateTenantStatus(tenantId, statusForm);
      toast.success(`Tenant ${statusForm.status}`);
      await loadTenant();
      onRefresh();
    } catch { toast.error('Failed to update status'); }
    finally { setSaving(false); }
  };

  const handleImpersonate = async () => {
    try {
      const res = await SuperAdminAPI.impersonateTenant(tenantId);
      const { code } = res.data.data;
      // Only a single-use, 30s-lived opaque code travels in the URL — the new
      // tab exchanges it server-side for the real session token, so the token
      // itself never appears in the address bar, browser history, or referrer
      // headers. See backend/utils/impersonationStore.js.
      window.open(`/dashboard?impersonate_code=${encodeURIComponent(code)}`, '_blank');
      toast.success('Impersonation session opened in a new tab.');
    } catch { toast.error('Impersonation failed'); }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtCurrency = (v) => `$${(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-modal sa-modal-lg">
        <div className="sa-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {tenant && (
              <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {tenant.name[0].toUpperCase()}
              </div>
            )}
            <div>
              <div className="sa-modal-title">{loading ? 'Loading...' : tenant?.name}</div>
              {tenant && <div style={{ fontSize: '0.75rem', color: 'var(--sa-text-dim)' }}>{tenant.email}</div>}
            </div>
          </div>
          <button className="sa-modal-close" onClick={onClose}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="sa-loader"><div className="sa-spinner" /></div>
        ) : (
          <>
            {/* Tabs */}
            <div className="sa-tabs" style={{ padding: '0 24px', margin: 0 }}>
              {['overview', 'plan', 'add-ons', 'users', 'status'].map(t => (
                <button key={t} className={`sa-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="sa-modal-body">
              {/* OVERVIEW */}
              {tab === 'overview' && (
                <div>
                  <div className="sa-grid-2" style={{ marginBottom: 16 }}>
                    <div>
                      <div className="sa-form-label">Business Name</div>
                      <div style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{tenant.name}</div>
                    </div>
                    <div>
                      <div className="sa-form-label">Email</div>
                      <div style={{ color: 'var(--sa-text)' }}>{tenant.email}</div>
                    </div>
                    <div>
                      <div className="sa-form-label">Status</div>
                      <span className={`sa-badge sa-badge-${tenant.status}`}>{tenant.status}</span>
                    </div>
                    <div>
                      <div className="sa-form-label">Current Plan</div>
                      <span className={`sa-badge sa-badge-${tenant.plan}`}>{tenant.plan || 'none'}</span>
                    </div>
                    <div>
                      <div className="sa-form-label">Plan Expires</div>
                      <div style={{ color: 'var(--sa-text)' }}>{fmtDate(tenant.planExpiresAt)}</div>
                    </div>
                    <div>
                      <div className="sa-form-label">Member Since</div>
                      <div style={{ color: 'var(--sa-text)' }}>{fmtDate(tenant.createdAt)}</div>
                    </div>
                    <div>
                      <div className="sa-form-label">Total Revenue</div>
                      <div style={{ color: 'var(--sa-success)', fontWeight: 700, fontSize: '1.1rem' }}>{fmtCurrency(tenant.totalRevenue)}</div>
                    </div>
                    <div>
                      <div className="sa-form-label">Total Users</div>
                      <div style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{tenant.users?.length || 0}</div>
                    </div>
                  </div>

                  {/* Impersonate */}
                  <div style={{ background: 'var(--sa-surface-2)', borderRadius: 8, border: '1px solid var(--sa-border)', padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--sa-text)', marginBottom: 2 }}>Login as Tenant Admin</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--sa-text-dim)' }}>Opens tenant dashboard in a new tab with a 4-hour session</div>
                    </div>
                    <button className="sa-btn sa-btn-primary" onClick={handleImpersonate}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      Impersonate Admin
                    </button>
                  </div>

                  {/* Notes */}
                  <div className="sa-form-group">
                    <label className="sa-form-label">Internal Notes</label>
                    <textarea
                      className="sa-input"
                      style={{ minHeight: 80, resize: 'vertical' }}
                      value={planForm.notes}
                      onChange={e => setPlanForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Private notes about this tenant..."
                    />
                    <button className="sa-btn sa-btn-ghost sa-btn-sm" style={{ marginTop: 8 }} onClick={savePlan} disabled={saving}>
                      Save Notes
                    </button>
                  </div>
                </div>
              )}

              {/* PLAN */}
              {tab === 'plan' && (
                <div>
                  <div className="sa-grid-2">
                    <div className="sa-form-group">
                      <label className="sa-form-label">Subscription Plan</label>
                      <select className="sa-select" value={planForm.plan} onChange={e => setPlanForm(f => ({ ...f, plan: e.target.value }))}>
                        {['none', 'free', 'starter', 'business', 'enterprise'].map(p => (
                          <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sa-form-group">
                      <label className="sa-form-label">Plan Expires At</label>
                      <input type="date" className="sa-input" value={planForm.planExpiresAt} onChange={e => setPlanForm(f => ({ ...f, planExpiresAt: e.target.value }))} />
                    </div>
                    <div className="sa-form-group">
                      <label className="sa-form-label">Trial Ends At</label>
                      <input type="date" className="sa-input" value={planForm.trialEndsAt} onChange={e => setPlanForm(f => ({ ...f, trialEndsAt: e.target.value }))} />
                    </div>
                  </div>
                  {/* Quick presets */}
                  <div style={{ marginBottom: 16 }}>
                    <div className="sa-form-label" style={{ marginBottom: 8 }}>Quick Presets</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[7, 14, 30, 90, 365].map(days => (
                        <button key={days} className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => {
                          const d = new Date(); d.setDate(d.getDate() + days);
                          setPlanForm(f => ({ ...f, planExpiresAt: d.toISOString().split('T')[0] }));
                        }}>
                          +{days}d
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="sa-btn sa-btn-primary" onClick={savePlan} disabled={saving} style={{ width: '100%' }}>
                    {saving ? 'Saving...' : 'Update Plan & Expiry'}
                  </button>
                </div>
              )}

              {/* ADD-ONS */}
              {tab === 'add-ons' && (
                <div>
                  <div className="sa-alert sa-alert-info">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    These add-ons are allocated on top of the base plan limits.
                  </div>
                  <div className="sa-grid-2">
                    <div className="sa-form-group">
                      <label className="sa-form-label">Extra Users</label>
                      <input type="number" min="0" className="sa-input" value={addOnForm.extraUsers} onChange={e => setAddOnForm(f => ({ ...f, extraUsers: e.target.value }))} />
                    </div>
                    <div className="sa-form-group">
                      <label className="sa-form-label">Extra Branches</label>
                      <input type="number" min="0" className="sa-input" value={addOnForm.extraBranches} onChange={e => setAddOnForm(f => ({ ...f, extraBranches: e.target.value }))} />
                    </div>
                    <div className="sa-form-group">
                      <label className="sa-form-label">SMS Credits</label>
                      <input type="number" min="0" className="sa-input" value={addOnForm.smsCredits} onChange={e => setAddOnForm(f => ({ ...f, smsCredits: e.target.value }))} />
                    </div>
                  </div>
                  <button className="sa-btn sa-btn-primary" onClick={saveAddOns} disabled={saving} style={{ width: '100%' }}>
                    {saving ? 'Saving...' : 'Save Add-Ons'}
                  </button>
                </div>
              )}

              {/* USERS */}
              {tab === 'users' && (
                <div>
                  {(tenant.users || []).length === 0 ? (
                    <div className="sa-empty"><div className="sa-empty-icon">👤</div><span>No users found</span></div>
                  ) : (
                    <div className="sa-table-wrap">
                      <table className="sa-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Last Login</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tenant.users.map(u => (
                            <tr key={u._id}>
                              <td style={{ fontWeight: 600 }}>{u.name}</td>
                              <td style={{ color: 'var(--sa-text-muted)' }}>{u.email}</td>
                              <td><span className="sa-badge sa-badge-starter">{u.role}</span></td>
                              <td>
                                <span className={`sa-badge ${u.isActive ? 'sa-badge-active' : 'sa-badge-suspended'}`}>
                                  {u.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td style={{ color: 'var(--sa-text-dim)', fontSize: '0.78rem' }}>
                                {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* STATUS */}
              {tab === 'status' && (
                <div>
                  {tenant.status === 'active' && (
                    <div className="sa-alert sa-alert-warning">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      Suspending this tenant will immediately deactivate all their user accounts.
                    </div>
                  )}
                  <div className="sa-form-group">
                    <label className="sa-form-label">Account Status</label>
                    <select className="sa-select" value={statusForm.status} onChange={e => setStatusForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  {statusForm.status === 'suspended' && (
                    <div className="sa-form-group">
                      <label className="sa-form-label">Reason for Suspension</label>
                      <textarea className="sa-input" style={{ minHeight: 80 }} value={statusForm.reason} onChange={e => setStatusForm(f => ({ ...f, reason: e.target.value }))} placeholder="Optional: explain why this account is being suspended..." />
                    </div>
                  )}
                  <button
                    className={`sa-btn ${statusForm.status === 'suspended' || statusForm.status === 'cancelled' ? 'sa-btn-danger' : 'sa-btn-primary'}`}
                    style={{ width: '100%' }}
                    onClick={saveStatus}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : `Set Status: ${statusForm.status}`}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TenantManagement() {
  const [tenants, setTenants] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', plan: '', status: '', page: 1 });
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await SuperAdminAPI.getTenants({ ...filters, limit: 20 });
      setTenants(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load tenants'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete tenant "${name}" and ALL their data? This is IRREVERSIBLE.`)) return;
    try {
      setDeletingId(id);
      await SuperAdminAPI.deleteTenant(id);
      toast.success(`Tenant "${name}" deleted`);
      load();
    } catch { toast.error('Delete failed'); }
    finally { setDeletingId(null); }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div>
      <div className="sa-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="sa-page-title">Tenant Management</h1>
          <p className="sa-page-subtitle">{pagination.total} registered businesses on the platform</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          className="sa-input"
          style={{ flex: '1 1 220px', maxWidth: 280 }}
          placeholder="Search by name or email..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
        />
        <select className="sa-select" style={{ flex: '0 0 140px' }} value={filters.plan} onChange={e => setFilters(f => ({ ...f, plan: e.target.value, page: 1 }))}>
          <option value="">All Plans</option>
          {['none', 'free', 'starter', 'business', 'enterprise'].map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
        <select className="sa-select" style={{ flex: '0 0 140px' }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
          <option value="">All Statuses</option>
          {['active', 'suspended', 'cancelled'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <button className="sa-btn sa-btn-ghost" onClick={load}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="sa-table-wrap">
        {loading ? (
          <div className="sa-loader"><div className="sa-spinner" /></div>
        ) : tenants.length === 0 ? (
          <div className="sa-empty"><div className="sa-empty-icon">🏢</div><span>No tenants found</span></div>
        ) : (
          <table className="sa-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Users</th>
                <th>Plan Expires</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {t.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--sa-text)', fontSize: '0.875rem' }}>{t.name}</div>
                        <div style={{ color: 'var(--sa-text-dim)', fontSize: '0.75rem' }}>{t.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`sa-badge sa-badge-${t.plan}`}>{t.plan || 'none'}</span></td>
                  <td><span className={`sa-badge sa-badge-${t.status}`}>{t.status}</span></td>
                  <td style={{ color: 'var(--sa-text-muted)' }}>{t.userCount || 0}</td>
                  <td style={{ color: 'var(--sa-text-muted)', fontSize: '0.8rem' }}>{fmtDate(t.planExpiresAt)}</td>
                  <td style={{ color: 'var(--sa-text-muted)', fontSize: '0.8rem' }}>{fmtDate(t.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setSelectedTenant(t._id)}>
                        Manage
                      </button>
                      <button
                        className="sa-btn sa-btn-danger sa-btn-sm"
                        onClick={() => handleDelete(t._id, t.name)}
                        disabled={deletingId === t._id}
                      >
                        {deletingId === t._id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              className={`sa-btn ${p === filters.page ? 'sa-btn-primary' : 'sa-btn-ghost'} sa-btn-sm`}
              onClick={() => setFilters(f => ({ ...f, page: p }))}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedTenant && (
        <TenantDetailModal
          tenantId={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
