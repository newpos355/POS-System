import React, { useEffect, useState } from 'react';
import {
  FiPlus, FiEdit, FiTrash2, FiX, FiCheck, FiSave, FiZap, FiLink, FiTool,
  FiPlay, FiSend, FiArrowLeft, FiCopy, FiClock, FiMail, FiBell, FiEdit3, FiActivity,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { AutomationAPI } from '../../services/api';
import '../settings/settings.css';

// ─── Shared bits ──────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => (
  <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="settings-modal" style={wide ? { maxWidth: '820px', width: '95%' } : undefined}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="modal-close" onClick={onClose}><FiX /></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

const emptyMsg = (text) => (
  <p style={{ textAlign: 'center', color: '#64748B', padding: '32px' }}>{text}</p>
);

const StatusBadge = ({ status }) => {
  if (!status) return <span style={{ color: '#94A3B8', fontSize: '12px' }}>Never run</span>;
  const map = { ok: ['badge-success', 'OK'], partial: ['badge-warning', 'Partial'], failed: ['badge-danger', 'Failed'] };
  const [cls, label] = map[status] || ['badge-warning', status];
  return <span className={`badge ${cls}`}>{label}</span>;
};

const ACTION_META = {
  email: { icon: <FiMail />, label: 'Send email' },
  webhook: { icon: <FiLink />, label: 'Call webhook' },
  notification: { icon: <FiBell />, label: 'In-app notification' },
  update_field: { icon: <FiEdit3 />, label: 'Update a field' },
};

// ─── Action list builder (shared by workflows & functions) ────────────────────
const ActionsBuilder = ({ actions, onChange, meta, placeholderHint }) => {
  const setAction = (i, patch) => onChange(actions.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  const setConfig = (i, patch) => onChange(actions.map((a, idx) => idx === i ? { ...a, config: { ...a.config, ...patch } } : a));
  const removeAction = (i) => onChange(actions.filter((_, idx) => idx !== i));
  const addAction = (type) => onChange([...actions, {
    type,
    config: type === 'email' ? { to: 'custom', recipients: [], templateId: '', subject: '', body: '' }
      : type === 'webhook' ? { webhookId: '' }
      : type === 'notification' ? { title: '', message: '', priority: 'medium' }
      : { field: 'notes', value: '' },
  }]);

  return (
    <div>
      {actions.map((a, i) => (
        <div key={i} style={{ border: '1px solid var(--border, #E2E8F0)', borderRadius: '10px', padding: '14px', marginBottom: '10px', background: 'var(--surface, #fff)' }}>
          <div className="flex-between" style={{ marginBottom: '10px' }}>
            <span style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', color: '#16A34A' }}>
              {ACTION_META[a.type]?.icon} {i + 1}. {ACTION_META[a.type]?.label}
            </span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeAction(i)}><FiX /></button>
          </div>

          {a.type === 'email' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Send To</label>
                  <select className="form-select form-input" value={a.config.to || 'custom'} onChange={e => setConfig(i, { to: e.target.value })}>
                    <option value="custom">Specific addresses</option>
                    <option value="customer">The customer on the record</option>
                  </select>
                </div>
                {(a.config.to || 'custom') === 'custom' && (
                  <div className="form-group">
                    <label className="form-label">Recipients (comma-separated)</label>
                    <input className="form-input" value={(a.config.recipients || []).join(', ')}
                      onChange={e => setConfig(i, { recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="owner@shop.com, manager@shop.com" />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Email Template</label>
                <select className="form-select form-input" value={a.config.templateId || ''} onChange={e => setConfig(i, { templateId: e.target.value })}>
                  <option value="">— Write inline below —</option>
                  {(meta?.emailTemplates || []).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
              {!a.config.templateId && (
                <>
                  <div className="form-group">
                    <label className="form-label">Subject</label>
                    <input className="form-input" value={a.config.subject || ''} onChange={e => setConfig(i, { subject: e.target.value })} placeholder="e.g. New sale {{order.number}} — {{order.total}}" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Body (HTML, supports {'{{placeholders}}'})</label>
                    <textarea className="form-input" rows={4} value={a.config.body || ''} onChange={e => setConfig(i, { body: e.target.value })} style={{ fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }} />
                  </div>
                </>
              )}
            </>
          )}

          {a.type === 'webhook' && (
            <div className="form-group">
              <label className="form-label">Webhook</label>
              <select className="form-select form-input" value={a.config.webhookId || ''} onChange={e => setConfig(i, { webhookId: e.target.value })}>
                <option value="">— Select a configured webhook —</option>
                {(meta?.webhooks || []).map(w => <option key={w._id} value={w._id}>{w.name} ({w.url})</option>)}
              </select>
              {(meta?.webhooks || []).length === 0 && <small style={{ color: '#D97706', fontSize: '12px' }}>No webhooks configured yet — add one on the Webhooks tab first.</small>}
            </div>
          )}

          {a.type === 'notification' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input className="form-input" value={a.config.title || ''} onChange={e => setConfig(i, { title: e.target.value })} placeholder="e.g. Big sale: {{order.total}}" />
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-select form-input" value={a.config.priority || 'medium'} onChange={e => setConfig(i, { priority: e.target.value })}>
                    {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <input className="form-input" value={a.config.message || ''} onChange={e => setConfig(i, { message: e.target.value })} placeholder="e.g. {{customer.name}} spent {{order.total}}" />
              </div>
            </>
          )}

          {a.type === 'update_field' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Field</label>
                <input className="form-input" value={a.config.field || ''} onChange={e => setConfig(i, { field: e.target.value })} placeholder="notes  or  customFields.my_field" />
                <small style={{ color: '#94A3B8', fontSize: '11px' }}>Only "notes" or "customFields.*" on the triggering record.</small>
              </div>
              <div className="form-group">
                <label className="form-label">New Value</label>
                <input className="form-input" value={a.config.value ?? ''} onChange={e => setConfig(i, { value: e.target.value })} placeholder="Supports {{placeholders}}" />
              </div>
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {Object.entries(ACTION_META).map(([type, m]) => (
          <button key={type} type="button" className="btn btn-outline btn-sm" onClick={() => addAction(type)}>
            <FiPlus /> {m.label}
          </button>
        ))}
      </div>
      {placeholderHint && placeholderHint.length > 0 && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#94A3B8' }}>
          Available placeholders: {placeholderHint.map(f => `{{${f}}}`).join(', ')}
        </div>
      )}
    </div>
  );
};

// ═══ WORKFLOWS ════════════════════════════════════════════════════════════════

const OPERATORS = [
  ['eq', 'equals'], ['neq', 'not equals'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'],
  ['contains', 'contains'], ['not_contains', "doesn't contain"], ['is_empty', 'is empty'], ['not_empty', 'is not empty'],
];

const WorkflowsTab = ({ meta }) => {
  const [workflows, setWorkflows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const events = meta?.events || [];
  const eventFor = (key) => events.find(e => e.key === key);

  const load = () => AutomationAPI.getWorkflows()
    .then(res => setWorkflows(res.data?.data || []))
    .catch(() => toast.error('Failed to load workflows'));
  useEffect(() => { load(); }, []);

  const openEditor = (wf = null) => {
    setEditing(wf || {});
    setForm(wf ? {
      name: wf.name, description: wf.description || '', triggerEvent: wf.triggerEvent,
      conditions: (wf.conditions || []).map(c => ({ ...c })),
      conditionLogic: wf.conditionLogic || 'and',
      actions: (wf.actions || []).map(a => ({ type: a.type, config: { ...a.config } })),
      isActive: wf.isActive !== false,
    } : {
      name: '', description: '', triggerEvent: events[0]?.key || 'sale.created',
      conditions: [], conditionLogic: 'and', actions: [], isActive: true,
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('A workflow name is required');
    if (!form.actions.length) return toast.error('Add at least one action');
    setSaving(true);
    try {
      if (editing?._id) {
        await AutomationAPI.updateWorkflow(editing._id, form);
        toast.success('Workflow updated');
      } else {
        await AutomationAPI.createWorkflow(form);
        toast.success('Workflow created');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save workflow');
    } finally { setSaving(false); }
  };

  const handleToggle = async (wf) => {
    try {
      await AutomationAPI.updateWorkflow(wf._id, { isActive: !wf.isActive });
      load();
    } catch { toast.error('Failed to update workflow'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this workflow?')) return;
    try {
      await AutomationAPI.deleteWorkflow(id);
      setWorkflows(prev => prev.filter(w => w._id !== id));
      toast.success('Workflow deleted');
    } catch { toast.error('Failed to delete workflow'); }
  };

  const condFields = eventFor(form?.triggerEvent)?.fields || [];

  if (editing !== null && form) {
    return (
      <div className="settings-card">
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}><FiArrowLeft /></button>
            {editing._id ? 'Edit Workflow' : 'New Workflow'}
          </h2>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><FiSave /> {saving ? 'Saving...' : 'Save Workflow'}</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Workflow Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Email owner on big sales" autoFocus />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', paddingBottom: '10px' }}>
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
              Active
            </label>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
        </div>

        {/* WHEN */}
        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '16px', marginTop: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>When this happens</div>
          <select className="form-select form-input" value={form.triggerEvent}
            onChange={e => setForm(p => ({ ...p, triggerEvent: e.target.value, conditions: [] }))}>
            {events.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </div>

        {/* IF */}
        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '16px', marginTop: '12px' }}>
          <div className="flex-between" style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '1px' }}>Only if (optional)</div>
            {form.conditions.length > 1 && (
              <select className="form-select form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
                value={form.conditionLogic} onChange={e => setForm(p => ({ ...p, conditionLogic: e.target.value }))}>
                <option value="and">ALL conditions match</option>
                <option value="or">ANY condition matches</option>
              </select>
            )}
          </div>
          {form.conditions.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr auto', gap: '8px', marginBottom: '8px' }}>
              <select className="form-select form-input" value={c.field} onChange={e => setForm(p => ({ ...p, conditions: p.conditions.map((x, idx) => idx === i ? { ...x, field: e.target.value } : x) }))}>
                {condFields.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="form-select form-input" value={c.operator} onChange={e => setForm(p => ({ ...p, conditions: p.conditions.map((x, idx) => idx === i ? { ...x, operator: e.target.value } : x) }))}>
                {OPERATORS.map(([op, label]) => <option key={op} value={op}>{label}</option>)}
              </select>
              {!['is_empty', 'not_empty'].includes(c.operator) ? (
                <input className="form-input" value={c.value ?? ''} onChange={e => setForm(p => ({ ...p, conditions: p.conditions.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x) }))} placeholder="Value" />
              ) : <div />}
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setForm(p => ({ ...p, conditions: p.conditions.filter((_, idx) => idx !== i) }))}><FiX /></button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm"
            onClick={() => setForm(p => ({ ...p, conditions: [...p.conditions, { field: condFields[0] || '', operator: 'eq', value: '' }] }))}>
            <FiPlus /> Add Condition
          </button>
        </div>

        {/* THEN */}
        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '16px', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Then do this</div>
          <ActionsBuilder actions={form.actions} onChange={(actions) => setForm(p => ({ ...p, actions }))} meta={meta} placeholderHint={condFields} />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="flex-between">
        <div>
          <h2>Workflow Rules</h2>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>When an event happens and conditions match, run actions: email alerts, webhooks, notifications, field updates.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openEditor()}><FiPlus /> New Workflow</button>
      </div>
      {workflows.length === 0 ? emptyMsg('No workflows yet. Try "Email me when a sale over 500,000 happens".') : (
        <div className="table-container mt-4">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Trigger</th><th>Actions</th><th>Runs</th><th>Last Run</th><th>Active</th><th style={{ textAlign: 'right' }}>Manage</th></tr></thead>
            <tbody>
              {workflows.map(wf => (
                <tr key={wf._id}>
                  <td>
                    <strong>{wf.name}</strong>
                    {wf.lastError && <p style={{ fontSize: '11px', color: '#DC2626', margin: '2px 0 0' }}>{wf.lastError}</p>}
                  </td>
                  <td style={{ fontSize: '13px' }}>{eventFor(wf.triggerEvent)?.label || wf.triggerEvent}{(wf.conditions || []).length > 0 && <span style={{ color: '#94A3B8' }}> + {wf.conditions.length} condition(s)</span>}</td>
                  <td style={{ fontSize: '13px', color: '#64748B' }}>{(wf.actions || []).map(a => ACTION_META[a.type]?.label).join(', ')}</td>
                  <td>{wf.runCount || 0}</td>
                  <td><StatusBadge status={wf.lastStatus} /></td>
                  <td>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={Boolean(wf.isActive)} onChange={() => handleToggle(wf)} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEditor(wf)}><FiEdit /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(wf._id)}><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ═══ WEBHOOKS ═════════════════════════════════════════════════════════════════

const WebhooksTab = ({ meta, onChanged }) => {
  const [hooks, setHooks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingHook, setEditingHook] = useState(null);
  const [form, setForm] = useState({ name: '', url: '', events: [] });
  const [newSecret, setNewSecret] = useState(null);
  const [deliveries, setDeliveries] = useState(null);

  const events = meta?.events || [];

  const load = () => AutomationAPI.getWebhooks()
    .then(res => setHooks(res.data?.data || []))
    .catch(() => toast.error('Failed to load webhooks'));
  useEffect(() => { load(); }, []);

  const openModal = (h = null) => {
    setEditingHook(h);
    setForm(h ? { name: h.name, url: h.url, events: [...(h.events || [])] } : { name: '', url: '', events: [] });
    setShowModal(true);
  };

  const toggleEvent = (key) => setForm(p => ({
    ...p, events: p.events.includes(key) ? p.events.filter(e => e !== key) : [...p.events, key],
  }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return toast.error('Name and URL are required');
    try {
      if (editingHook) {
        await AutomationAPI.updateWebhook(editingHook._id, form);
        toast.success('Webhook updated');
      } else {
        const res = await AutomationAPI.createWebhook(form);
        setNewSecret(res.data?.data);
        toast.success('Webhook created');
      }
      setShowModal(false);
      load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save webhook');
    }
  };

  const handleToggle = async (h) => {
    try {
      await AutomationAPI.updateWebhook(h._id, { isActive: !h.isActive });
      load();
    } catch { toast.error('Failed to update webhook'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this webhook? Workflows using it will fail until reassigned.')) return;
    try {
      await AutomationAPI.deleteWebhook(id);
      setHooks(prev => prev.filter(h => h._id !== id));
      toast.success('Webhook deleted');
      onChanged?.();
    } catch { toast.error('Failed to delete webhook'); }
  };

  const handleTest = async (id) => {
    const t = toast.loading('Sending test delivery...');
    try {
      const res = await AutomationAPI.testWebhook(id);
      toast.dismiss(t);
      res.data?.success ? toast.success(res.data.message) : toast.error(res.data?.message || 'Delivery failed');
      load();
    } catch (err) {
      toast.dismiss(t);
      toast.error(err.response?.data?.message || 'Test failed');
    }
  };

  const showDeliveries = async (h) => {
    try {
      const res = await AutomationAPI.getWebhookDeliveries(h._id);
      setDeliveries(res.data?.data);
    } catch { toast.error('Failed to load deliveries'); }
  };

  return (
    <div className="settings-card">
      <div className="flex-between">
        <div>
          <h2>Webhooks</h2>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>POST event payloads to external systems, signed with HMAC-SHA256 (X-ApexPOS-Signature header).</p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal()}><FiPlus /> New Webhook</button>
      </div>

      {hooks.length === 0 ? emptyMsg('No webhooks yet. Point one at Zapier, Make, or your own API.') : (
        <div className="table-container mt-4">
          <table className="data-table">
            <thead><tr><th>Name</th><th>URL</th><th>Events</th><th>Last Delivery</th><th>Active</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {hooks.map(h => (
                <tr key={h._id}>
                  <td><strong>{h.name}</strong></td>
                  <td style={{ fontSize: '12px', fontFamily: 'monospace', color: '#64748B', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.url}</td>
                  <td style={{ fontSize: '12px', color: '#64748B' }}>{(h.events || []).length ? h.events.join(', ') : 'Via workflows only'}</td>
                  <td>
                    <StatusBadge status={h.lastStatus === 'ok' ? 'ok' : h.lastStatus === 'failed' ? 'failed' : null} />
                    {h.failureCount > 0 && <span style={{ fontSize: '11px', color: '#DC2626', marginLeft: '6px' }}>{h.failureCount} failure(s)</span>}
                  </td>
                  <td>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={Boolean(h.isActive)} onChange={() => handleToggle(h)} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" title="Send test delivery" onClick={() => handleTest(h._id)}><FiSend /></button>
                      <button className="btn btn-outline btn-sm" title="Delivery log" onClick={() => showDeliveries(h)}><FiActivity /></button>
                      <button className="btn btn-outline btn-sm" onClick={() => openModal(h)}><FiEdit /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(h._id)}><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editingHook ? 'Edit Webhook' : 'New Webhook'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required autoFocus placeholder="e.g. Zapier — new sales" />
            </div>
            <div className="form-group">
              <label className="form-label">Endpoint URL *</label>
              <input className="form-input" type="url" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} required placeholder="https://hooks.example.com/abc123" />
            </div>
            <div className="form-group">
              <label className="form-label">Subscribe to events (optional — can also be fired from workflows)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                {events.map(e => (
                  <label key={e.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.events.includes(e.key)} onChange={() => toggleEvent(e.key)} />
                    {e.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><FiCheck /> {editingHook ? 'Save Changes' : 'Create Webhook'}</button>
            </div>
          </form>
        </Modal>
      )}

      {newSecret && (
        <Modal title="Webhook Created — Copy Your Secret" onClose={() => setNewSecret(null)}>
          <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '12px' }}>
            Use this secret to verify the <code>X-ApexPOS-Signature</code> header (HMAC-SHA256 of the raw request body). It is shown <strong>only once</strong>.
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
            <code style={{ fontSize: '13px', wordBreak: 'break-all', flex: 1 }}>{newSecret.secret}</code>
            <button className="btn btn-outline btn-sm" onClick={() => { navigator.clipboard.writeText(newSecret.secret); toast.success('Copied'); }}><FiCopy /></button>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={() => setNewSecret(null)}><FiCheck /> I've saved it</button>
          </div>
        </Modal>
      )}

      {deliveries && (
        <Modal title={`Deliveries — ${deliveries.name}`} onClose={() => setDeliveries(null)} wide>
          {(deliveries.deliveries || []).length === 0 ? emptyMsg('No deliveries yet.') : (
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Event</th><th>Time</th><th>Result</th><th>Duration</th></tr></thead>
                <tbody>
                  {deliveries.deliveries.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{d.event}</td>
                      <td style={{ fontSize: '13px' }}>{new Date(d.at).toLocaleString()}</td>
                      <td>
                        {d.success
                          ? <span className="badge badge-success">HTTP {d.statusCode}</span>
                          : <span className="badge badge-danger">{d.error || `HTTP ${d.statusCode || '?'}`}</span>}
                      </td>
                      <td style={{ fontSize: '13px', color: '#64748B' }}>{d.durationMs != null ? `${d.durationMs} ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

// ═══ CUSTOM FUNCTIONS ═════════════════════════════════════════════════════════

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FN_ENTITY_LABELS = { salesOrder: 'Sale page', customer: 'Customer page', product: 'Product page' };

const FunctionsTab = ({ meta }) => {
  const [fns, setFns] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => AutomationAPI.getFunctions()
    .then(res => setFns(res.data?.data || []))
    .catch(() => toast.error('Failed to load functions'));
  useEffect(() => { load(); }, []);

  const openEditor = (fn = null) => {
    setEditing(fn || {});
    setForm(fn ? {
      name: fn.name, description: fn.description || '', type: fn.type,
      entity: fn.entity || 'salesOrder',
      actions: (fn.actions || []).map(a => ({ type: a.type, config: { ...a.config } })),
      schedule: { frequency: 'daily', hour: 7, dayOfWeek: 1, dayOfMonth: 1, ...(fn.schedule || {}) },
      isActive: fn.isActive !== false,
    } : {
      name: '', description: '', type: 'button', entity: 'salesOrder',
      actions: [], schedule: { frequency: 'daily', hour: 7, dayOfWeek: 1, dayOfMonth: 1 }, isActive: true,
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('A function name is required');
    if (!form.actions.length) return toast.error('Add at least one action');
    setSaving(true);
    try {
      if (editing?._id) {
        await AutomationAPI.updateFunction(editing._id, form);
        toast.success('Function updated');
      } else {
        await AutomationAPI.createFunction(form);
        toast.success('Function created');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save function');
    } finally { setSaving(false); }
  };

  const handleRun = async (fn) => {
    if (fn.type === 'button' && fn.entity) {
      const where = (FN_ENTITY_LABELS[fn.entity] || 'record page').toLowerCase();
      return toast(`This button runs from its record page — open a ${where.replace(' page', '')} and click it there.`, { icon: 'ℹ️' });
    }
    const t = toast.loading(`Running "${fn.name}"...`);
    try {
      const res = await AutomationAPI.runFunction(fn._id, {});
      toast.dismiss(t);
      res.data?.success ? toast.success(res.data.message) : toast.error(res.data?.message || 'Run failed');
      load();
    } catch (err) {
      toast.dismiss(t);
      toast.error(err.response?.data?.message || 'Run failed');
    }
  };

  const handleToggle = async (fn) => {
    try {
      await AutomationAPI.updateFunction(fn._id, { isActive: !fn.isActive });
      load();
    } catch { toast.error('Failed to update function'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this function?')) return;
    try {
      await AutomationAPI.deleteFunction(id);
      setFns(prev => prev.filter(f => f._id !== id));
      toast.success('Function deleted');
    } catch { toast.error('Failed to delete function'); }
  };

  const scheduleText = (fn) => {
    const s = fn.schedule || {};
    if (s.frequency === 'hourly') return 'Every hour';
    if (s.frequency === 'weekly') return `${DAY_NAMES[s.dayOfWeek ?? 1]}s at ${String(s.hour ?? 7).padStart(2, '0')}:00`;
    if (s.frequency === 'monthly') return `Day ${s.dayOfMonth ?? 1} at ${String(s.hour ?? 7).padStart(2, '0')}:00`;
    return `Daily at ${String(s.hour ?? 7).padStart(2, '0')}:00`;
  };

  if (editing !== null && form) {
    return (
      <div className="settings-card">
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}><FiArrowLeft /></button>
            {editing._id ? 'Edit Function' : 'New Function'}
          </h2>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><FiSave /> {saving ? 'Saving...' : 'Save Function'}</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Function Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Email invoice copy" autoFocus />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', paddingBottom: '10px' }}>
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
              Active
            </label>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', margin: '8px 0 16px' }}>
          {[
            { id: 'button', label: 'Custom Button', desc: 'Shows on a record page — runs on that record when clicked.' },
            { id: 'scheduler', label: 'Scheduler', desc: 'Runs automatically on a schedule you set.' },
          ].map(t => (
            <div key={t.id} onClick={() => setForm(p => ({ ...p, type: t.id }))}
              style={{ border: `2px solid ${form.type === t.id ? '#16A34A' : 'var(--border, #E2E8F0)'}`, borderRadius: '12px', padding: '14px', cursor: 'pointer', background: form.type === t.id ? '#F0FDF4' : 'var(--surface, #fff)' }}>
              <div style={{ fontWeight: 700 }}>{t.label}</div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{t.desc}</div>
            </div>
          ))}
        </div>

        {form.type === 'button' ? (
          <div className="form-group" style={{ maxWidth: '300px' }}>
            <label className="form-label">Show button on</label>
            <select className="form-select form-input" value={form.entity} onChange={e => setForm(p => ({ ...p, entity: e.target.value }))}>
              {Object.entries(FN_ENTITY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 200px))', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Frequency</label>
              <select className="form-select form-input" value={form.schedule.frequency} onChange={e => setForm(p => ({ ...p, schedule: { ...p.schedule, frequency: e.target.value } }))}>
                {['hourly', 'daily', 'weekly', 'monthly'].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            {form.schedule.frequency !== 'hourly' && (
              <div className="form-group">
                <label className="form-label">Hour (0–23)</label>
                <input className="form-input" type="number" min="0" max="23" value={form.schedule.hour} onChange={e => setForm(p => ({ ...p, schedule: { ...p.schedule, hour: Number(e.target.value) } }))} />
              </div>
            )}
            {form.schedule.frequency === 'weekly' && (
              <div className="form-group">
                <label className="form-label">Day of Week</label>
                <select className="form-select form-input" value={form.schedule.dayOfWeek} onChange={e => setForm(p => ({ ...p, schedule: { ...p.schedule, dayOfWeek: Number(e.target.value) } }))}>
                  {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {form.schedule.frequency === 'monthly' && (
              <div className="form-group">
                <label className="form-label">Day of Month (1–28)</label>
                <input className="form-input" type="number" min="1" max="28" value={form.schedule.dayOfMonth} onChange={e => setForm(p => ({ ...p, schedule: { ...p.schedule, dayOfMonth: Number(e.target.value) } }))} />
              </div>
            )}
          </div>
        )}

        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '16px', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Actions</div>
          <ActionsBuilder
            actions={form.actions}
            onChange={(actions) => setForm(p => ({ ...p, actions }))}
            meta={meta}
            placeholderHint={form.type === 'button'
              ? (meta?.events || []).find(e => e.entity === form.entity)?.fields
              : ['business.name', 'date']}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="flex-between">
        <div>
          <h2>Functions, Buttons & Schedulers</h2>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>Reusable action sequences — as custom buttons on record pages or on an automatic schedule.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openEditor()}><FiPlus /> New Function</button>
      </div>
      {fns.length === 0 ? emptyMsg('No functions yet. Try a "Email invoice copy" button on the sale page, or a daily digest scheduler.') : (
        <div className="table-container mt-4">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Type</th><th>Where / When</th><th>Runs</th><th>Last Run</th><th>Active</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {fns.map(fn => (
                <tr key={fn._id}>
                  <td>
                    <strong>{fn.name}</strong>
                    {fn.lastError && <p style={{ fontSize: '11px', color: '#DC2626', margin: '2px 0 0' }}>{fn.lastError}</p>}
                  </td>
                  <td>
                    <span className={`badge ${fn.type === 'button' ? 'badge-success' : 'badge-warning'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {fn.type === 'button' ? <FiTool /> : <FiClock />} {fn.type}
                    </span>
                  </td>
                  <td style={{ fontSize: '13px', color: '#64748B' }}>
                    {fn.type === 'button' ? (FN_ENTITY_LABELS[fn.entity] || '—') : scheduleText(fn)}
                    {fn.type === 'scheduler' && fn.nextRunAt && <div style={{ fontSize: '11px', color: '#94A3B8' }}>Next: {new Date(fn.nextRunAt).toLocaleString()}</div>}
                  </td>
                  <td>{fn.runCount || 0}</td>
                  <td><StatusBadge status={fn.lastStatus} /></td>
                  <td>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={Boolean(fn.isActive)} onChange={() => handleToggle(fn)} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" title="Run now" onClick={() => handleRun(fn)}><FiPlay /></button>
                      <button className="btn btn-outline btn-sm" onClick={() => openEditor(fn)}><FiEdit /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(fn._id)}><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ═══ HUB ══════════════════════════════════════════════════════════════════════

const AutomationHub = () => {
  const [activeTab, setActiveTab] = useState('workflows');
  const [meta, setMeta] = useState(null);

  const loadMeta = () => AutomationAPI.getMeta()
    .then(res => setMeta(res.data?.data || null))
    .catch(() => toast.error('Failed to load automation settings'));
  useEffect(() => { loadMeta(); }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Automation</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Workflow rules, email alerts, webhooks, and custom functions</p>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-sidebar">
          {[
            { id: 'workflows', icon: <FiZap />, label: 'Workflows & Alerts' },
            { id: 'webhooks', icon: <FiLink />, label: 'Webhooks' },
            { id: 'functions', icon: <FiTool />, label: 'Functions & Buttons' },
          ].map(tab => (
            <button key={tab.id} className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {activeTab === 'workflows' && <WorkflowsTab meta={meta} />}
          {activeTab === 'webhooks' && <WebhooksTab meta={meta} onChanged={loadMeta} />}
          {activeTab === 'functions' && <FunctionsTab meta={meta} />}
        </div>
      </div>
    </div>
  );
};

export default AutomationHub;
