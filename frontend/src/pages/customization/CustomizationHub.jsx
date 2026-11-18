import React, { useEffect, useState } from 'react';
import {
  FiPlus, FiEdit, FiTrash2, FiX, FiCheck, FiSave, FiFileText, FiMail,
  FiList, FiGrid, FiEye, FiSend, FiStar, FiPlay, FiArrowLeft,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { CustomizationAPI } from '../../services/api';
import { getCurrency } from '../../utils/currency';
import '../settings/settings.css';

// ─── Shared modal ─────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => (
  <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="settings-modal" style={wide ? { maxWidth: '860px', width: '95%' } : undefined}>
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

// ═══ PDF TEMPLATES ════════════════════════════════════════════════════════════

const DEFAULT_DESIGN = {
  accentColor: '#16A34A', textColor: '#1E293B', fontFamily: 'Arial',
  paperSize: 'a4', logoUrl: '', headerText: '', footerText: 'Thank you for your business!',
  showLogo: true, showBusinessInfo: true, showCustomerInfo: true, showCashier: true,
  showSku: true, showDiscount: true, showTax: true, showPaymentInfo: true, showSignature: false,
  labels: {},
};

// Live sample document rendered with the design being edited — the same
// layout logic InvoiceView applies to real sales.
const PdfPreview = ({ design }) => {
  const d = { ...DEFAULT_DESIGN, ...design, labels: design?.labels || {} };
  const cur = getCurrency();
  const fmt = (n) => `${cur.symbol} ${Number(n).toLocaleString()}`;
  const thermal = d.paperSize === 'thermal-80mm';
  const title = d.labels.documentTitle || 'INVOICE';

  return (
    <div style={{
      background: 'white', color: d.textColor, fontFamily: `${d.fontFamily}, sans-serif`,
      border: '1px solid #E2E8F0', borderRadius: '8px', padding: thermal ? '16px' : '28px',
      maxWidth: thermal ? '300px' : '100%', margin: '0 auto', fontSize: thermal ? '11px' : '13px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {d.headerText && <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748B', marginBottom: '10px' }}>{d.headerText}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: thermal ? 'column' : 'row', gap: '8px', marginBottom: '18px' }}>
        <div>
          {d.showLogo && d.logoUrl && <img src={d.logoUrl} alt="logo" style={{ maxHeight: '42px', maxWidth: '140px', marginBottom: '6px', objectFit: 'contain' }} />}
          <div style={{ fontSize: thermal ? '15px' : '22px', fontWeight: 800, color: d.accentColor }}>{title}</div>
          <div style={{ color: '#64748B', fontSize: '11px' }}>#SO-2026-0042</div>
        </div>
        {d.showBusinessInfo && (
          <div style={{ textAlign: thermal ? 'left' : 'right', fontSize: '11px', color: '#64748B' }}>
            <div style={{ fontWeight: 700, color: d.textColor, fontSize: '13px' }}>Your Business Name</div>
            <div>Kampala, Uganda</div>
            <div>+256 700 000 000</div>
          </div>
        )}
      </div>
      {d.showCustomerInfo && (
        <div style={{ marginBottom: '14px', fontSize: '12px' }}>
          <span style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{d.labels.billTo || 'Bill To'}: </span>
          <strong>Jane Doe</strong>
          {d.showCashier && <span style={{ color: '#64748B' }}> · Cashier: Alex</span>}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${d.accentColor}` }}>
            <th style={{ textAlign: 'left', padding: '5px 4px', fontSize: '10px', textTransform: 'uppercase', color: '#64748B' }}>Item</th>
            <th style={{ textAlign: 'center', padding: '5px 4px', fontSize: '10px', textTransform: 'uppercase', color: '#64748B' }}>Qty</th>
            <th style={{ textAlign: 'right', padding: '5px 4px', fontSize: '10px', textTransform: 'uppercase', color: '#64748B' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {[{ n: 'Sample Product A', s: 'SKU-001', q: 2, t: 80000 }, { n: 'Sample Product B', s: 'SKU-002', q: 1, t: 40000 }].map((it, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={{ padding: '6px 4px' }}>
                {it.n}
                {d.showSku && <div style={{ fontSize: '9px', color: '#94A3B8' }}>{it.s}</div>}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>{it.q}</td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}>{fmt(it.t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginLeft: 'auto', maxWidth: thermal ? '100%' : '220px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#64748B' }}><span>Subtotal</span><span>{fmt(120000)}</span></div>
        {d.showDiscount && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: d.accentColor }}><span>Discount</span><span>-{fmt(5000)}</span></div>}
        {d.showTax && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#64748B' }}><span>Tax</span><span>{fmt(20700)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `2px solid ${d.accentColor}`, marginTop: '4px', fontWeight: 800, color: d.accentColor }}>
          <span>{d.labels.totalLabel || 'TOTAL'}</span><span>{fmt(135700)}</span>
        </div>
        {d.showPaymentInfo && <div style={{ fontSize: '10px', color: '#64748B', textAlign: 'right', marginTop: '4px' }}>Paid — Cash</div>}
      </div>
      {d.showSignature && (
        <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
          <div style={{ flex: 1, borderTop: '1px solid #CBD5E1', paddingTop: '4px', fontSize: '10px', color: '#94A3B8' }}>Authorized Signature</div>
          <div style={{ flex: 1, borderTop: '1px solid #CBD5E1', paddingTop: '4px', fontSize: '10px', color: '#94A3B8' }}>Customer Signature</div>
        </div>
      )}
      {d.footerText && <div style={{ borderTop: '1px solid #F1F5F9', marginTop: '16px', paddingTop: '10px', textAlign: 'center', color: '#94A3B8', fontSize: '10px' }}>{d.footerText}</div>}
    </div>
  );
};

const PdfTemplatesTab = ({ meta }) => {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // null = list, {} = new, {..} = edit
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => CustomizationAPI.getPdfTemplates()
    .then(res => setTemplates(res.data?.data || []))
    .catch(() => toast.error('Failed to load PDF templates'));
  useEffect(() => { load(); }, []);

  const openEditor = (tpl = null) => {
    setEditing(tpl || {});
    setForm(tpl ? {
      name: tpl.name, documentType: tpl.documentType, isDefault: tpl.isDefault,
      design: { ...DEFAULT_DESIGN, ...(tpl.design || {}), labels: tpl.design?.labels || {} },
    } : {
      name: '', documentType: 'invoice', isDefault: templates.length === 0,
      design: { ...DEFAULT_DESIGN },
    });
  };

  const setDesign = (patch) => setForm(p => ({ ...p, design: { ...p.design, ...patch } }));
  const setLabel = (key, value) => setForm(p => ({ ...p, design: { ...p.design, labels: { ...p.design.labels, [key]: value } } }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Template name is required');
    setSaving(true);
    try {
      if (editing?._id) {
        await CustomizationAPI.updatePdfTemplate(editing._id, form);
        toast.success('Template updated');
      } else {
        await CustomizationAPI.createPdfTemplate(form);
        toast.success('Template created');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await CustomizationAPI.deletePdfTemplate(id);
      setTemplates(prev => prev.filter(t => t._id !== id));
      toast.success('Template deleted');
    } catch { toast.error('Failed to delete template'); }
  };

  if (editing !== null && form) {
    return (
      <div className="settings-card">
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}><FiArrowLeft /></button>
            {editing._id ? 'Edit PDF Template' : 'New PDF Template'}
          </h2>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <FiSave /> {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Template Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Branded A4 Invoice" autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Document Type</label>
                <select className="form-select form-input" value={form.documentType} onChange={e => setForm(p => ({ ...p, documentType: e.target.value }))}>
                  {(meta?.documentTypes || ['invoice', 'receipt', 'quote', 'purchase-order']).map(t => (
                    <option key={t} value={t}>{t.replace('-', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Paper Size</label>
                <select className="form-select form-input" value={form.design.paperSize} onChange={e => setDesign({ paperSize: e.target.value })}>
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                  <option value="thermal-80mm">Thermal 80mm</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Accent Color</label>
                <input className="form-input" type="color" value={form.design.accentColor} onChange={e => setDesign({ accentColor: e.target.value })} style={{ height: '40px', padding: '4px' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Text Color</label>
                <input className="form-input" type="color" value={form.design.textColor} onChange={e => setDesign({ textColor: e.target.value })} style={{ height: '40px', padding: '4px' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Font</label>
                <select className="form-select form-input" value={form.design.fontFamily} onChange={e => setDesign({ fontFamily: e.target.value })}>
                  {['Arial', 'Georgia', 'Courier New', 'Times New Roman', 'Verdana'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Logo URL</label>
              <input className="form-input" value={form.design.logoUrl} onChange={e => setDesign({ logoUrl: e.target.value })} placeholder="https://.../logo.png" />
            </div>
            <div className="form-group">
              <label className="form-label">Document Title</label>
              <input className="form-input" value={form.design.labels.documentTitle || ''} onChange={e => setLabel('documentTitle', e.target.value)} placeholder="INVOICE (default)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">"Bill To" Label</label>
                <input className="form-input" value={form.design.labels.billTo || ''} onChange={e => setLabel('billTo', e.target.value)} placeholder="Bill To" />
              </div>
              <div className="form-group">
                <label className="form-label">"Total" Label</label>
                <input className="form-input" value={form.design.labels.totalLabel || ''} onChange={e => setLabel('totalLabel', e.target.value)} placeholder="TOTAL" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Header Text</label>
              <input className="form-input" value={form.design.headerText} onChange={e => setDesign({ headerText: e.target.value })} placeholder="Optional line above the document" />
            </div>
            <div className="form-group">
              <label className="form-label">Footer Text</label>
              <textarea className="form-input" rows={2} value={form.design.footerText} onChange={e => setDesign({ footerText: e.target.value })} style={{ resize: 'none', fontFamily: 'inherit' }} />
            </div>

            <div>
              <label className="form-label">Sections</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                {[
                  ['showLogo', 'Logo'], ['showBusinessInfo', 'Business info'],
                  ['showCustomerInfo', 'Customer info'], ['showCashier', 'Cashier'],
                  ['showSku', 'SKUs'], ['showDiscount', 'Discount row'],
                  ['showTax', 'Tax row'], ['showPaymentInfo', 'Payment info'],
                  ['showSignature', 'Signature lines'],
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={Boolean(form.design[key])} onChange={e => setDesign({ [key]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', padding: '10px', background: '#F0FDF4', borderRadius: '8px' }}>
              <input type="checkbox" checked={Boolean(form.isDefault)} onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))} />
              <FiStar style={{ color: '#16A34A' }} /> Use as the default {form.documentType.replace('-', ' ')} template
            </label>
          </div>

          {/* Live preview */}
          <div style={{ position: 'sticky', top: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FiEye /> Live Preview
            </div>
            <div style={{ background: '#F1F5F9', borderRadius: '12px', padding: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
              <PdfPreview design={form.design} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="flex-between">
        <div>
          <h2>PDF Templates</h2>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>Design how invoices, receipts and quotes print. The ★ default template is used automatically.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openEditor()}><FiPlus /> New Template</button>
      </div>
      {templates.length === 0 ? emptyMsg('No templates yet. Create one to customize your printed invoices and receipts.') : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px', marginTop: '18px' }}>
          {templates.map(t => (
            <div key={t._id} style={{ border: '1px solid var(--border, #E2E8F0)', borderRadius: '12px', padding: '16px', background: 'var(--surface, #fff)' }}>
              <div className="flex-between">
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: `${t.design?.accentColor || '#16A34A'}20`, color: t.design?.accentColor || '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FiFileText />
                </div>
                {t.isDefault && <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: '4px' }}><FiStar /> Default</span>}
              </div>
              <div style={{ fontWeight: 700, marginTop: '10px' }}>{t.name}</div>
              <div style={{ fontSize: '12px', color: '#64748B', textTransform: 'capitalize' }}>{t.documentType.replace('-', ' ')} · {t.design?.paperSize?.toUpperCase()}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => openEditor(t)}><FiEdit /> Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t._id)}><FiTrash2 /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══ EMAIL TEMPLATES ══════════════════════════════════════════════════════════

const EmailTemplatesTab = ({ meta }) => {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => CustomizationAPI.getEmailTemplates()
    .then(res => setTemplates(res.data?.data || []))
    .catch(() => toast.error('Failed to load email templates'));
  useEffect(() => { load(); }, []);

  const openEditor = (tpl = null) => {
    setPreview(null);
    setEditing(tpl || {});
    setForm(tpl ? { name: tpl.name, subject: tpl.subject, bodyHtml: tpl.bodyHtml, isActive: tpl.isActive } : {
      name: '', subject: '', isActive: true,
      bodyHtml: '<h2 style="color:#16A34A;">Hello {{customer.name}},</h2>\n<p>Thank you for your order <strong>{{order.number}}</strong> of {{order.total}}.</p>\n{{items_table}}\n<p>— {{business.name}}</p>',
    });
  };

  const insertPlaceholder = (ph) => setForm(p => ({ ...p, bodyHtml: `${p.bodyHtml}{{${ph}}}` }));

  const handlePreview = async () => {
    try {
      const res = await CustomizationAPI.previewEmailTemplate({ subject: form.subject, bodyHtml: form.bodyHtml });
      setPreview(res.data?.data);
    } catch { toast.error('Preview failed'); }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.bodyHtml.trim()) {
      return toast.error('Name, subject and body are all required');
    }
    setSaving(true);
    try {
      if (editing?._id) {
        await CustomizationAPI.updateEmailTemplate(editing._id, form);
        toast.success('Template updated');
      } else {
        await CustomizationAPI.createEmailTemplate(form);
        toast.success('Template created');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    } finally { setSaving(false); }
  };

  const handleTest = async (id) => {
    try {
      const res = await CustomizationAPI.testEmailTemplate(id, {});
      toast.success(res.data?.message || 'Test email sent');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test send failed — is email configured?');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template? Workflows using it will fail until reassigned.')) return;
    try {
      await CustomizationAPI.deleteEmailTemplate(id);
      setTemplates(prev => prev.filter(t => t._id !== id));
      toast.success('Template deleted');
    } catch { toast.error('Failed to delete template'); }
  };

  if (editing !== null && form) {
    return (
      <div className="settings-card">
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}><FiArrowLeft /></button>
            {editing._id ? 'Edit Email Template' : 'New Email Template'}
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline" onClick={handlePreview}><FiEye /> Preview</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}><FiSave /> {saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: '24px', alignItems: 'start' }}>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Template Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Order confirmation" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Subject *</label>
                <input className="form-input" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Your order {{order.number}} is confirmed" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Body (HTML) *</label>
              <textarea className="form-input" rows={14} value={form.bodyHtml} onChange={e => setForm(p => ({ ...p, bodyHtml: e.target.value }))} style={{ fontFamily: 'Courier New, monospace', fontSize: '12px', resize: 'vertical' }} />
            </div>
            <div>
              <label className="form-label">Click to insert a placeholder</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {(meta?.placeholders || []).map(ph => (
                  <button key={ph} type="button" onClick={() => insertPlaceholder(ph)}
                    style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', cursor: 'pointer', fontFamily: 'monospace' }}>
                    {`{{${ph}}}`}
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={Boolean(form.isActive)} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
              Active (available to workflows)
            </label>
          </div>

          {preview && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Preview (sample data)</div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ background: '#F8FAFC', padding: '10px 14px', borderBottom: '1px solid #E2E8F0', fontSize: '13px' }}>
                  <strong>Subject:</strong> {preview.subject}
                </div>
                <iframe title="email-preview" srcDoc={preview.bodyHtml} style={{ width: '100%', height: '420px', border: 'none', background: 'white' }} sandbox="" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="flex-between">
        <div>
          <h2>Email Templates</h2>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>Reusable emails with placeholders — used by workflow email alerts and custom functions.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openEditor()}><FiPlus /> New Template</button>
      </div>
      {templates.length === 0 ? emptyMsg('No email templates yet.') : (
        <div className="table-container mt-4">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Subject</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {templates.map(t => (
                <tr key={t._id}>
                  <td><strong>{t.name}</strong></td>
                  <td style={{ color: '#64748B', fontSize: '13px' }}>{t.subject}</td>
                  <td><span className={`badge ${t.isActive ? 'badge-success' : 'badge-danger'}`}>{t.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" title="Send a test to yourself" onClick={() => handleTest(t._id)}><FiSend /></button>
                      <button className="btn btn-outline btn-sm" onClick={() => openEditor(t)}><FiEdit /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t._id)}><FiTrash2 /></button>
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

// ═══ CUSTOM FIELDS ════════════════════════════════════════════════════════════

const ENTITY_LABELS = { product: 'Products', customer: 'Customers', salesOrder: 'Sales Orders', vendor: 'Vendors' };

const CustomFieldsTab = () => {
  const [entity, setEntity] = useState('customer');
  const [fields, setFields] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [form, setForm] = useState({ label: '', type: 'text', options: '', required: false, order: 0 });

  const load = () => CustomizationAPI.getCustomFields({ entity })
    .then(res => setFields(res.data?.data || []))
    .catch(() => toast.error('Failed to load custom fields'));
  useEffect(() => { load(); }, [entity]); // eslint-disable-line react-hooks/exhaustive-deps

  const openModal = (f = null) => {
    setEditingField(f);
    setForm(f
      ? { label: f.label, type: f.type, options: (f.options || []).join(', '), required: f.required, order: f.order }
      : { label: '', type: 'text', options: '', required: false, order: fields.length });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      entity,
      label: form.label,
      type: form.type,
      options: form.type === 'select' ? form.options.split(',').map(s => s.trim()).filter(Boolean) : [],
      required: form.required,
      order: Number(form.order) || 0,
    };
    try {
      if (editingField) {
        await CustomizationAPI.updateCustomField(editingField._id, payload);
        toast.success('Field updated');
      } else {
        await CustomizationAPI.createCustomField(payload);
        toast.success('Field created');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save field');
    }
  };

  const handleToggle = async (f) => {
    try {
      await CustomizationAPI.updateCustomField(f._id, { isActive: !f.isActive });
      load();
    } catch { toast.error('Failed to update field'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this field definition? Values already saved on records are kept but no longer shown.')) return;
    try {
      await CustomizationAPI.deleteCustomField(id);
      setFields(prev => prev.filter(f => f._id !== id));
      toast.success('Field deleted');
    } catch { toast.error('Failed to delete field'); }
  };

  return (
    <div className="settings-card">
      <div className="flex-between">
        <div>
          <h2>Custom Fields</h2>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>Add your own fields to core records. They appear automatically on the Customer, Product and Vendor forms.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal()}><FiPlus /> Add Field</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
        {Object.entries(ENTITY_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => setEntity(key)}
            style={{
              padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              border: `2px solid ${entity === key ? '#16A34A' : 'var(--border, #E2E8F0)'}`,
              background: entity === key ? '#F0FDF4' : 'var(--surface, #fff)',
              color: entity === key ? '#15803D' : '#64748B',
            }}>
            {label}
          </button>
        ))}
      </div>
      {entity === 'salesOrder' && (
        <p style={{ fontSize: '12px', color: '#D97706', marginTop: '10px' }}>
          Sales orders have no edit form — these fields are stored on each order and filled by
          workflow "update a field" actions or the API, not at the POS checkout.
        </p>
      )}

      {fields.length === 0 ? emptyMsg(`No custom fields on ${ENTITY_LABELS[entity]} yet.`) : (
        <div className="table-container mt-4">
          <table className="data-table">
            <thead><tr><th>Label</th><th>Key</th><th>Type</th><th>Required</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {fields.map(f => (
                <tr key={f._id}>
                  <td><strong>{f.label}</strong></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#64748B' }}>{f.key}</td>
                  <td style={{ textTransform: 'capitalize' }}>{f.type}{f.type === 'select' && ` (${(f.options || []).length} options)`}</td>
                  <td>{f.required ? 'Yes' : 'No'}</td>
                  <td>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={Boolean(f.isActive)} onChange={() => handleToggle(f)} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openModal(f)}><FiEdit /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(f._id)}><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editingField ? 'Edit Field' : `New Field on ${ENTITY_LABELS[entity]}`} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Label *</label>
              <input className="form-input" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} required autoFocus placeholder="e.g. Loyalty Tier" />
              {editingField && <small style={{ color: '#94A3B8', fontSize: '11px' }}>Key stays "{editingField.key}" — saved values keep working.</small>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select form-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {['text', 'textarea', 'number', 'date', 'select', 'checkbox'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Display Order</label>
                <input className="form-input" type="number" value={form.order} onChange={e => setForm(p => ({ ...p, order: e.target.value }))} />
              </div>
            </div>
            {form.type === 'select' && (
              <div className="form-group">
                <label className="form-label">Options (comma-separated)</label>
                <input className="form-input" value={form.options} onChange={e => setForm(p => ({ ...p, options: e.target.value }))} placeholder="Bronze, Silver, Gold" />
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', marginTop: '4px' }}>
              <input type="checkbox" checked={form.required} onChange={e => setForm(p => ({ ...p, required: e.target.checked }))} />
              Required on the form
            </label>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><FiCheck /> {editingField ? 'Save Changes' : 'Create Field'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

// ═══ CUSTOM VIEWS ═════════════════════════════════════════════════════════════

const OPERATOR_LABELS = {
  eq: 'equals', neq: 'not equals', gt: '>', gte: '≥', lt: '<', lte: '≤',
  contains: 'contains', not_contains: "doesn't contain",
};

const CustomViewsTab = ({ meta }) => {
  const [views, setViews] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingView, setEditingView] = useState(null);
  const [form, setForm] = useState(null);
  const [openView, setOpenView] = useState(null); // {view, columns, rows, total}
  const [loadingData, setLoadingData] = useState(false);

  const entities = meta?.viewEntities || {};

  const load = () => CustomizationAPI.getCustomViews()
    .then(res => setViews(res.data?.data || []))
    .catch(() => toast.error('Failed to load views'));
  useEffect(() => { load(); }, []);

  const openModal = (v = null) => {
    setEditingView(v);
    const entity = v?.entity || Object.keys(entities)[0] || 'sales';
    setForm(v ? {
      name: v.name, description: v.description || '', entity,
      filters: (v.filters || []).map(f => ({ ...f })),
      columns: [...(v.columns || [])],
      sort: { field: v.sort?.field || 'createdAt', direction: v.sort?.direction || 'desc' },
      isShared: v.isShared !== false,
    } : {
      name: '', description: '', entity,
      filters: [], columns: Object.keys(entities[entity]?.fields || {}).slice(0, 5),
      sort: { field: 'createdAt', direction: 'desc' }, isShared: true,
    });
    setShowModal(true);
  };

  const fieldsFor = (entity) => entities[entity]?.fields || {};

  const changeEntity = (entity) => setForm(p => ({
    ...p, entity, filters: [],
    columns: Object.keys(fieldsFor(entity)).slice(0, 5),
    sort: { field: 'createdAt', direction: 'desc' },
  }));

  const addFilter = () => setForm(p => ({
    ...p,
    filters: [...p.filters, { field: Object.keys(fieldsFor(p.entity))[0], operator: 'eq', value: '' }],
  }));
  const setFilter = (i, patch) => setForm(p => ({
    ...p, filters: p.filters.map((f, idx) => idx === i ? { ...f, ...patch } : f),
  }));
  const removeFilter = (i) => setForm(p => ({ ...p, filters: p.filters.filter((_, idx) => idx !== i) }));
  const toggleColumn = (key) => setForm(p => ({
    ...p,
    columns: p.columns.includes(key) ? p.columns.filter(c => c !== key) : [...p.columns, key],
  }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('A view name is required');
    if (!form.columns.length) return toast.error('Pick at least one column');
    try {
      if (editingView) {
        await CustomizationAPI.updateCustomView(editingView._id, form);
        toast.success('View updated');
      } else {
        await CustomizationAPI.createCustomView(form);
        toast.success('View created');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save view');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this view?')) return;
    try {
      await CustomizationAPI.deleteCustomView(id);
      setViews(prev => prev.filter(v => v._id !== id));
      if (openView?.view?._id === id) setOpenView(null);
      toast.success('View deleted');
    } catch { toast.error('Failed to delete view'); }
  };

  const handleOpen = async (v) => {
    setLoadingData(true);
    try {
      const res = await CustomizationAPI.getCustomViewData(v._id);
      setOpenView(res.data?.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to run view');
    } finally { setLoadingData(false); }
  };

  const cellValue = (row, col) => {
    const v = row[col.key];
    if (v === undefined || v === null || v === '') return '—';
    if (col.type === 'date') return new Date(v).toLocaleDateString();
    if (col.type === 'number') return Number(v).toLocaleString();
    return String(v);
  };

  // ── Results (module page) ──────────────────────────────────────────────────
  if (openView) {
    return (
      <div className="settings-card">
        <div className="flex-between" style={{ marginBottom: '4px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setOpenView(null)}><FiArrowLeft /></button>
            {openView.view.name}
          </h2>
          <span style={{ fontSize: '13px', color: '#64748B' }}>
            {openView.total.toLocaleString()} record(s){openView.truncated ? ' — showing first 500' : ''}
          </span>
        </div>
        {openView.view.description && <p style={{ color: '#64748B', fontSize: '13px' }}>{openView.view.description}</p>}
        <div className="table-container mt-4">
          <table className="data-table">
            <thead><tr>{openView.columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {openView.rows.map(row => (
                <tr key={row._id}>
                  {openView.columns.map(c => <td key={c.key}>{cellValue(row, c)}</td>)}
                </tr>
              ))}
              {openView.rows.length === 0 && (
                <tr><td colSpan={openView.columns.length} style={{ textAlign: 'center', color: '#64748B', padding: '32px' }}>No records match this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="flex-between">
        <div>
          <h2>Custom Views</h2>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>Saved, filtered slices of your data that open as their own module pages.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal()}><FiPlus /> New View</button>
      </div>

      {views.length === 0 ? emptyMsg('No custom views yet. Build one — e.g. "Unpaid credit sales over 100k".') : (
        <div className="table-container mt-4">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Entity</th><th>Filters</th><th>Visibility</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {views.map(v => (
                <tr key={v._id}>
                  <td>
                    <strong>{v.name}</strong>
                    {v.description && <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>{v.description}</p>}
                  </td>
                  <td>{entities[v.entity]?.label || v.entity}</td>
                  <td style={{ fontSize: '12px', color: '#64748B' }}>
                    {(v.filters || []).length === 0 ? 'All records' : (v.filters || []).map((f, i) => (
                      <div key={i}>{fieldsFor(v.entity)[f.field]?.label || f.field} {OPERATOR_LABELS[f.operator]} {String(f.value ?? '')}</div>
                    ))}
                  </td>
                  <td><span className={`badge ${v.isShared ? 'badge-success' : 'badge-warning'}`}>{v.isShared ? 'Shared' : 'Private'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary btn-sm" disabled={loadingData} onClick={() => handleOpen(v)}><FiPlay /> Open</button>
                      <button className="btn btn-outline btn-sm" onClick={() => openModal(v)}><FiEdit /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(v._id)}><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && form && (
        <Modal title={editingView ? 'Edit View' : 'New Custom View'} onClose={() => setShowModal(false)} wide>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">View Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required autoFocus placeholder="e.g. Unpaid credit sales" />
              </div>
              <div className="form-group">
                <label className="form-label">Entity</label>
                <select className="form-select form-input" value={form.entity} onChange={e => changeEntity(e.target.value)} disabled={Boolean(editingView)}>
                  {Object.entries(entities).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
            </div>

            <label className="form-label" style={{ marginTop: '8px' }}>Filters (all must match)</label>
            {form.filters.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr auto', gap: '8px', marginBottom: '8px' }}>
                <select className="form-select form-input" value={f.field} onChange={e => setFilter(i, { field: e.target.value })}>
                  {Object.entries(fieldsFor(form.entity)).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                </select>
                <select className="form-select form-input" value={f.operator} onChange={e => setFilter(i, { operator: e.target.value })}>
                  {Object.entries(OPERATOR_LABELS).map(([op, label]) => <option key={op} value={op}>{label}</option>)}
                </select>
                <input className="form-input"
                  type={fieldsFor(form.entity)[f.field]?.type === 'number' ? 'number' : fieldsFor(form.entity)[f.field]?.type === 'date' ? 'date' : 'text'}
                  value={f.value ?? ''} onChange={e => setFilter(i, { value: e.target.value })} placeholder="Value" />
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeFilter(i)}><FiX /></button>
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-sm" onClick={addFilter}><FiPlus /> Add Filter</button>

            <div style={{ marginTop: '16px' }}>
              <label className="form-label">Columns</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {Object.entries(fieldsFor(form.entity)).map(([key, cfg]) => (
                  <label key={key} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer',
                    padding: '5px 10px', borderRadius: '16px',
                    border: `1px solid ${form.columns.includes(key) ? '#16A34A' : '#E2E8F0'}`,
                    background: form.columns.includes(key) ? '#F0FDF4' : 'transparent',
                  }}>
                    <input type="checkbox" style={{ display: 'none' }} checked={form.columns.includes(key)} onChange={() => toggleColumn(key)} />
                    {form.columns.includes(key) && <FiCheck style={{ color: '#16A34A' }} />}
                    {cfg.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">Sort By</label>
                <select className="form-select form-input" value={form.sort.field} onChange={e => setForm(p => ({ ...p, sort: { ...p.sort, field: e.target.value } }))}>
                  {Object.entries(fieldsFor(form.entity)).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Direction</label>
                <select className="form-select form-input" value={form.sort.direction} onChange={e => setForm(p => ({ ...p, sort: { ...p.sort, direction: e.target.value } }))}>
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', paddingBottom: '10px' }}>
                  <input type="checkbox" checked={form.isShared} onChange={e => setForm(p => ({ ...p, isShared: e.target.checked }))} />
                  Shared with the whole team
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><FiCheck /> {editingView ? 'Save Changes' : 'Create View'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

// ═══ HUB ══════════════════════════════════════════════════════════════════════

const CustomizationHub = () => {
  const [activeTab, setActiveTab] = useState('pdf');
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    CustomizationAPI.getMeta()
      .then(res => setMeta(res.data?.data || null))
      .catch(() => toast.error('Failed to load customization settings'));
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customization</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>PDF templates, email templates, custom fields, and custom views</p>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-sidebar">
          {[
            { id: 'pdf', icon: <FiFileText />, label: 'PDF Templates' },
            { id: 'email', icon: <FiMail />, label: 'Email Templates' },
            { id: 'fields', icon: <FiList />, label: 'Custom Fields' },
            { id: 'views', icon: <FiGrid />, label: 'Custom Views' },
          ].map(tab => (
            <button key={tab.id} className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {activeTab === 'pdf' && <PdfTemplatesTab meta={meta} />}
          {activeTab === 'email' && <EmailTemplatesTab meta={meta} />}
          {activeTab === 'fields' && <CustomFieldsTab />}
          {activeTab === 'views' && <CustomViewsTab meta={meta} />}
        </div>
      </div>
    </div>
  );
};

export default CustomizationHub;
