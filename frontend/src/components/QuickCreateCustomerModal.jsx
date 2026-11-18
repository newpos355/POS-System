import React, { useState } from 'react';
import { FiX, FiUser, FiPhone, FiMail, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { CustomersAPI } from '../services/api';

const QuickCreateCustomerModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Customer full name is required');
    if (!form.phone.trim()) return toast.error('Phone number is required');
    if (!form.email.trim()) return toast.error('Email address is required');
    setSaving(true);
    try {
      const res = await CustomersAPI.createCustomer(form);
      const newCustomer = res.data?.data;
      toast.success(`Customer "${form.name}" created!`);
      if (onCreated) onCreated(newCustomer);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: '16px',
        padding: '24px',
        width: '400px',
        maxWidth: '95vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #16A34A, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <FiUser />
            </div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>New Customer</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '18px', padding: '4px' }}>
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted, #64748B)', display: 'block', marginBottom: '6px' }}>
              Full Name *
            </label>
            <div style={{ position: 'relative' }}>
              <FiUser style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 14 }} />
              <input
                type="text"
                placeholder="John Doe"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
                required
                style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1.5px solid var(--border, #e2e8f0)', borderRadius: '8px', fontSize: '14px', background: 'var(--background, #f8fafc)', color: 'var(--text, #0f172a)', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted, #64748B)', display: 'block', marginBottom: '6px' }}>
              Phone Number *
            </label>
            <div style={{ position: 'relative' }}>
              <FiPhone style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 14 }} />
              <input
                type="tel"
                placeholder="+256 700 000 000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                required
                style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1.5px solid var(--border, #e2e8f0)', borderRadius: '8px', fontSize: '14px', background: 'var(--background, #f8fafc)', color: 'var(--text, #0f172a)', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '22px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted, #64748B)', display: 'block', marginBottom: '6px' }}>
              Email Address *
            </label>
            <div style={{ position: 'relative' }}>
              <FiMail style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 14 }} />
              <input
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1.5px solid var(--border, #e2e8f0)', borderRadius: '8px', fontSize: '14px', background: 'var(--background, #f8fafc)', color: 'var(--text, #0f172a)', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border, #e2e8f0)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text, #0f172a)' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #16A34A, #059669)', color: 'white', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}>
              <FiCheck /> {saving ? 'Saving...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickCreateCustomerModal;
