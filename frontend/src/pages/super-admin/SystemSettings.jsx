import React, { useEffect, useState } from 'react';
import { SuperAdminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function SystemSettings() {
  const [settings, setSettings] = useState({
    platformName: 'POS Platform SaaS',
    supportEmail: 'support@posplatform.com',
    allowRegistrations: true,
    maintenanceMode: false,
    currency: 'USD ($)',
    trialPeriodDays: 14,
    stripeMode: 'test',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await SuperAdminAPI.getSystemSettings();
      setSettings(res.data.data);
    } catch {
      toast.error('Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setEdited(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await SuperAdminAPI.updateSystemSettings({ settings });
      toast.success('System settings saved successfully');
      setEdited(false);
    } catch {
      toast.error('Failed to save system settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sa-loader"><div className="sa-spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="sa-page-title">Platform Global Settings</h1>
          <p className="sa-page-subtitle">Configure system-wide parameters, maintenance toggles, and registration policies</p>
        </div>
        <button
          className="sa-btn sa-btn-primary"
          onClick={handleSave}
          disabled={saving || !edited}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {edited && (
        <div className="sa-alert sa-alert-warning">
          ⚠️ You have unsaved changes. Click "Save Settings" to apply changes globally.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* General Settings */}
        <div className="sa-card">
          <div className="sa-card-header">
            <span className="sa-card-title">⚙️ General Platform Config</span>
          </div>
          <div className="sa-card-body">
            <div className="sa-form-group">
              <label className="sa-form-label">Platform Name</label>
              <input
                className="sa-input"
                value={settings.platformName || ''}
                onChange={e => updateField('platformName', e.target.value)}
              />
            </div>

            <div className="sa-form-group">
              <label className="sa-form-label">Support Email Address</label>
              <input
                type="email"
                className="sa-input"
                value={settings.supportEmail || ''}
                onChange={e => updateField('supportEmail', e.target.value)}
              />
            </div>

            <div className="sa-grid-2">
              <div className="sa-form-group">
                <label className="sa-form-label">Default Currency</label>
                <select
                  className="sa-select"
                  value={settings.currency || 'USD ($)'}
                  onChange={e => updateField('currency', e.target.value)}
                >
                  <option value="USD ($)">USD ($)</option>
                  <option value="EUR (€)">EUR (€)</option>
                  <option value="GBP (£)">GBP (£)</option>
                  <option value="UGX (USh)">UGX (USh)</option>
                  <option value="KES (KSh)">KES (KSh)</option>
                </select>
              </div>

              <div className="sa-form-group">
                <label className="sa-form-label">Trial Period (Days)</label>
                <input
                  type="number"
                  min="0"
                  className="sa-input"
                  value={settings.trialPeriodDays ?? 14}
                  onChange={e => updateField('trialPeriodDays', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Security & Access Policies */}
        <div className="sa-card">
          <div className="sa-card-header">
            <span className="sa-card-title">🔒 Access Control & Maintenance</span>
          </div>
          <div className="sa-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Allow Registrations */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, background: 'var(--sa-surface-2)', borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Allow Public Registrations</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--sa-text-muted)', marginTop: 2 }}>
                  Enable or disable self-service signup for new tenant businesses
                </div>
              </div>
              <input
                type="checkbox"
                style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#16a34a' }}
                checked={!!settings.allowRegistrations}
                onChange={e => updateField('allowRegistrations', e.target.checked)}
              />
            </div>

            {/* Maintenance Mode */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, background: 'var(--sa-surface-2)', borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: settings.maintenanceMode ? '#ef4444' : 'var(--sa-text)' }}>
                  Platform Maintenance Mode
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--sa-text-muted)', marginTop: 2 }}>
                  Restrict tenant login access during system updates
                </div>
              </div>
              <input
                type="checkbox"
                style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#ef4444' }}
                checked={!!settings.maintenanceMode}
                onChange={e => updateField('maintenanceMode', e.target.checked)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
