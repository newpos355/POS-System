import React, { useEffect, useState } from 'react';
import { SuperAdminAPI } from '../../services/api';
import toast from 'react-hot-toast';

const PLAN_KEYS = ['starter', 'business', 'enterprise'];

export default function PricingConfig() {
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      setLoading(true);
      const res = await SuperAdminAPI.getPricingConfig();
      setPricing(res.data.data);
    } catch {
      toast.error('Failed to load pricing config');
    } finally {
      setLoading(false);
    }
  };

  const update = (plan, field, value) => {
    setPricing(prev => ({
      ...prev,
      [plan]: { ...prev[plan], [field]: value },
    }));
    setEdited(true);
  };

  const updateLimit = (plan, field, value) => {
    setPricing(prev => ({
      ...prev,
      [plan]: {
        ...prev[plan],
        limits: { ...prev[plan].limits, [field]: value === '-1' ? -1 : parseInt(value) || 0 },
      },
    }));
    setEdited(true);
  };

  const updateFeature = (plan, idx, value) => {
    const feats = [...(pricing[plan].features || [])];
    feats[idx] = value;
    update(plan, 'features', feats);
  };

  const addFeature = (plan) => {
    const feats = [...(pricing[plan].features || []), ''];
    update(plan, 'features', feats);
  };

  const removeFeature = (plan, idx) => {
    const feats = pricing[plan].features.filter((_, i) => i !== idx);
    update(plan, 'features', feats);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await SuperAdminAPI.updatePricingConfig({ pricing });
      toast.success('Pricing configuration saved to database');
      setEdited(false);
    } catch {
      toast.error('Failed to save pricing config');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset to last saved configuration?')) {
      fetchPricing();
      setEdited(false);
    }
  };

  const PLAN_THEME = {
    starter: { color: '#3b82f6', label: 'Starter', icon: '🚀' },
    business: { color: '#10b981', label: 'Business', icon: '💼' },
    enterprise: { color: '#8b5cf6', label: 'Enterprise', icon: '🏢' },
  };

  if (loading) return <div className="sa-loader"><div className="sa-spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="sa-page-title">Pricing Configuration</h1>
          <p className="sa-page-subtitle">Manage subscription plan prices, limits, and features stored in the database</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {edited && (
            <button className="sa-btn sa-btn-ghost" onClick={handleReset}>
              Reset
            </button>
          )}
          <button className="sa-btn sa-btn-primary" onClick={handleSave} disabled={saving || !edited}>
            {saving ? (
              <><span className="sa-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving...</>
            ) : (
              <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Save Changes</>
            )}
          </button>
        </div>
      </div>

      {edited && (
        <div className="sa-alert sa-alert-warning" style={{ marginBottom: 20 }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          You have unsaved changes. Click "Save Changes" to persist to the database.
        </div>
      )}

      {pricing && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {PLAN_KEYS.map(plan => {
            const theme = PLAN_THEME[plan];
            const p = pricing[plan] || {};
            return (
              <div key={plan} className="sa-card" style={{ border: `1px solid ${theme.color}33` }}>
                {/* Plan Header */}
                <div className="sa-card-header" style={{ background: `${theme.color}11` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.3rem' }}>{theme.icon}</span>
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: theme.color, fontFamily: 'Outfit, sans-serif' }}>{theme.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subscription Plan</div>
                    </div>
                  </div>
                  <span className={`sa-badge sa-badge-${plan}`}>{plan}</span>
                </div>

                <div className="sa-card-body">
                  {/* Pricing */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>💰 Pricing</div>
                    <div className="sa-grid-2">
                      <div className="sa-form-group">
                        <label className="sa-form-label">Monthly ($)</label>
                        <input
                          type="number" min="0"
                          className="sa-input"
                          value={p.monthlyPrice || 0}
                          onChange={e => update(plan, 'monthlyPrice', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="sa-form-group">
                        <label className="sa-form-label">Annual ($)</label>
                        <input
                          type="number" min="0"
                          className="sa-input"
                          value={p.annualPrice || 0}
                          onChange={e => update(plan, 'annualPrice', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--sa-text-dim)', marginTop: 4 }}>
                      Annual savings: ${Math.max(0, (p.monthlyPrice || 0) * 12 - (p.annualPrice || 0)).toFixed(0)}/yr
                    </div>
                  </div>

                  {/* Limits */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {[['users', 'Users'], ['branches', 'Branches'], ['products', 'Products']].map(([field, label]) => (
                        <div key={field} className="sa-form-group" style={{ marginBottom: 0 }}>
                          <label className="sa-form-label">{label}</label>
                          <input
                            type="number" min="-1"
                            className="sa-input"
                            value={p.limits?.[field] ?? 0}
                            onChange={e => updateLimit(plan, field, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Features */}
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>✨ Features</div>
                    {(p.features || []).map((feat, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input
                          className="sa-input"
                          style={{ flex: 1 }}
                          value={feat}
                          onChange={e => updateFeature(plan, idx, e.target.value)}
                          placeholder="Feature description"
                        />
                        <button
                          className="sa-btn sa-btn-danger sa-btn-sm"
                          style={{ flexShrink: 0 }}
                          onClick={() => removeFeature(plan, idx)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button className="sa-btn sa-btn-ghost sa-btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={() => addFeature(plan)}>
                      + Add Feature
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Currency note */}
      <div className="sa-alert sa-alert-info" style={{ marginTop: 20 }}>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <strong>Note:</strong> These prices are stored in MongoDB for display purposes on the pricing page. To change actual Stripe billing amounts, you must also update the prices in your Stripe Dashboard and update the price IDs in your environment variables.
        </div>
      </div>
    </div>
  );
}
