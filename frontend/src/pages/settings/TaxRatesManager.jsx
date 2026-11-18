import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiStar } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { TaxRatesAPI } from '../../services/api';

// Named tax rates (VAT 18%, Zero-rated 0%, ...). Products pick one on the
// product form; the ★ default applies to products with no rate of their own
// and overrides the legacy single percentage above.
const TaxRatesManager = () => {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', rate: '' });
  const [saving, setSaving] = useState(false);

  const fetchRates = () => {
    TaxRatesAPI.getTaxRates()
      .then(res => { if (res.data?.success) setRates(res.data.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(fetchRates, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const rate = parseFloat(form.rate);
    if (!form.name.trim()) return toast.error('Give the rate a name (e.g. "VAT 18%")');
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return toast.error('Rate must be 0–100%');
    setSaving(true);
    try {
      const res = await TaxRatesAPI.createTaxRate({ name: form.name.trim(), rate, isDefault: rates.length === 0 });
      if (res.data?.success) {
        toast.success(`Tax rate "${res.data.data.name}" added`);
        setForm({ name: '', rate: '' });
        fetchRates();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add tax rate');
    } finally {
      setSaving(false);
    }
  };

  const handleDefault = async (r) => {
    try {
      await TaxRatesAPI.updateTaxRate(r._id, { isDefault: true });
      toast.success(`"${r.name}" is now the default rate`);
      fetchRates();
    } catch (error) {
      toast.error('Failed to set default');
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete "${r.name}"? Products using it keep their current percentage but lose the link.`)) return;
    try {
      await TaxRatesAPI.deleteTaxRate(r._id);
      toast.success('Tax rate deleted');
      fetchRates();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <div style={{ marginTop: '28px' }}>
      <h3 style={{ marginBottom: '6px', fontSize: '15px' }}>Named Tax Rates</h3>
      <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '14px' }}>
        Define multiple rates and assign them per product (product form → Tax Rate). The ★ default
        applies to products without their own rate. Tax-exempt customers pay no tax regardless.
      </p>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px', marginBottom: '14px', maxWidth: '480px' }}>
        <input className="form-input" placeholder='Name (e.g. "VAT 18%")' value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className="form-input" type="number" min="0" max="100" step="any" placeholder="%" style={{ width: '90px' }}
          value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <FiPlus /> Add
        </button>
      </form>

      {loading ? (
        <p style={{ color: '#64748B' }}>Loading…</p>
      ) : rates.length === 0 ? (
        <p style={{ color: '#94A3B8', fontSize: '13px' }}>No named rates yet — the single default percentage above applies to everything.</p>
      ) : (
        <div style={{ maxWidth: '480px' }}>
          {rates.map(r => (
            <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '6px' }}>
              <strong style={{ flex: 1 }}>{r.name}</strong>
              <span className="badge badge-default">{r.rate}%</span>
              {r.isDefault ? (
                <span className="badge badge-success" title="Default rate">★ Default</span>
              ) : (
                <button type="button" className="btn btn-outline btn-sm" title="Make default" onClick={() => handleDefault(r)}>
                  <FiStar />
                </button>
              )}
              <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>
                <FiTrash2 />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaxRatesManager;
