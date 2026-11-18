import React, { useEffect, useState } from 'react';
import { CustomizationAPI } from '../services/api';

// Renders the tenant's custom fields for one entity as form inputs.
// Drop into any form:
//   <CustomFieldsSection entity="customer" values={form.customFields}
//     onChange={cf => setForm(p => ({ ...p, customFields: cf }))} />
// Renders nothing when the tenant has no fields defined for the entity.
const CustomFieldsSection = ({ entity, values = {}, onChange, title = 'Additional Information' }) => {
  const [fields, setFields] = useState([]);

  useEffect(() => {
    let cancelled = false;
    CustomizationAPI.getCustomFields({ entity, activeOnly: 'true' })
      .then(res => {
        if (!cancelled && res.data?.success) setFields(res.data.data || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [entity]);

  if (!fields.length) return null;

  const setValue = (key, value) => onChange({ ...(values || {}), [key]: value });

  const renderInput = (f) => {
    const value = values?.[f.key] ?? f.defaultValue ?? '';
    switch (f.type) {
      case 'textarea':
        return (
          <textarea className="form-input" rows={2} value={value || ''} required={f.required}
            onChange={e => setValue(f.key, e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        );
      case 'number':
        return (
          <input className="form-input" type="number" value={value ?? ''} required={f.required}
            onChange={e => setValue(f.key, e.target.value === '' ? '' : Number(e.target.value))} />
        );
      case 'date':
        return (
          <input className="form-input" type="date" value={value || ''} required={f.required}
            onChange={e => setValue(f.key, e.target.value)} />
        );
      case 'select':
        return (
          <select className="form-select form-input" value={value || ''} required={f.required}
            onChange={e => setValue(f.key, e.target.value)}>
            <option value="">— Select —</option>
            {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px 0' }}>
            <input type="checkbox" checked={Boolean(value)} onChange={e => setValue(f.key, e.target.checked)} />
            <span style={{ fontSize: '13px', color: '#64748B' }}>Yes</span>
          </label>
        );
      default:
        return (
          <input className="form-input" type="text" value={value || ''} required={f.required}
            onChange={e => setValue(f.key, e.target.value)} />
        );
    }
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #E2E8F0' }}>
        {title}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {fields.map(f => (
          <div key={f._id} className="form-group">
            <label className="form-label">
              {f.label}{f.required && <span style={{ color: '#DC2626' }}> *</span>}
            </label>
            {renderInput(f)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomFieldsSection;
