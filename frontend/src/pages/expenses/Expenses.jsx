import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiDollarSign, FiDownload, FiUpload, FiSearch, FiFilter, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ExpensesAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';

const CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Marketing', 'Transport', 'Supplies', 'Maintenance', 'Insurance', 'Taxes', 'Other'];

const Expenses = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ category: 'Other', description: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
  const [saving, setSaving] = useState(false);
  // Filters
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => { fetchExpenses(); }, []);

  const fetchExpenses = async (params = {}) => {
    setLoading(true);
    try {
      const res = await ExpensesAPI.getExpenses({ limit: 200, ...params });
      if (res.data?.data) setExpenses(res.data.data);
    } catch { toast.error('Failed to load expenses'); }
    finally { setLoading(false); }
  };

  const applyFilters = () => {
    const params = {};
    if (filterCategory !== 'All') params.category = filterCategory;
    if (filterSearch.trim()) params.search = filterSearch.trim();
    if (filterFrom) params.from = filterFrom;
    if (filterTo) params.to = filterTo;
    fetchExpenses(params);
  };

  const clearFilters = () => {
    setFilterCategory('All'); setFilterSearch(''); setFilterFrom(''); setFilterTo('');
    fetchExpenses();
  };

  const hasFilters = filterCategory !== 'All' || filterSearch || filterFrom || filterTo;

  const openModal = (exp = null) => {
    setEditing(exp);
    setForm(exp
      ? { category: exp.category, description: exp.description, amount: exp.amount, date: new Date(exp.date).toISOString().split('T')[0], notes: exp.notes || '' }
      : { category: 'Other', description: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '' }
    );
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.description || !form.amount) return toast.error('Description and amount required');
    setSaving(true);
    try {
      if (editing) {
        const res = await ExpensesAPI.updateExpense(editing._id || editing.id, form);
        setExpenses(prev => prev.map(ex => (ex._id || ex.id) === (editing._id || editing.id) ? res.data.data : ex));
        toast.success('Expense updated');
      } else {
        const res = await ExpensesAPI.createExpense(form);
        setExpenses(prev => [res.data.data, ...prev]);
        toast.success('Expense added');
      }
      setShowModal(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save expense'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await ExpensesAPI.deleteExpense(id);
      setExpenses(prev => prev.filter(ex => (ex._id || ex.id) !== id));
      toast.success('Expense deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const exportCSV = () => {
    if (!expenses.length) return toast.error('No data to export');
    const rows = expenses.map(e => ({ Date: new Date(e.date).toLocaleDateString(), Category: e.category, Description: e.description, Amount: e.amount, Notes: e.notes || '' }));
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'expenses.csv'; a.click();
    toast.success('Exported!');
  };

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const byCategory = CATEGORIES.map(cat => ({ cat, total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0) })).filter(c => c.total > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Track business expenses for P&L reporting</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-outline" onClick={exportCSV}><FiDownload /> Export CSV</button>
          <button className="btn btn-primary" onClick={() => openModal()}><FiPlus /> Add Expense</button>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Search Description</label>
          <div style={{ position: 'relative' }}>
            <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
              placeholder="e.g. rent, salaries..."
              style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>
        {/* Category */}
        <div style={{ minWidth: '160px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Category</label>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', fontSize: '13px' }}>
            <option>All</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        {/* Date From */}
        <div style={{ minWidth: '140px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>From Date</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', fontSize: '13px' }} />
        </div>
        {/* Date To */}
        <div style={{ minWidth: '140px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>To Date</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', fontSize: '13px' }} />
        </div>
        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={applyFilters} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiFilter /> Apply</button>
          {hasFilters && <button onClick={clearFilters} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiX /> Clear</button>}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>Total Expenses</p>
          <h3 style={{ margin: '4px 0 0', fontSize: '20px', color: '#DC2626' }}>{formatCurrency(total)}</h3>
        </div>
        {byCategory.slice(0, 4).map(c => (
          <div key={c.cat} className="card" style={{ padding: '16px' }}>
            <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>{c.cat}</p>
            <h3 style={{ margin: '4px 0 0', fontSize: '18px' }}>{formatCurrency(c.total)}</h3>
          </div>
        ))}
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Notes</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {expenses.map(ex => (
                <tr key={ex._id || ex.id}>
                  <td>{new Date(ex.date).toLocaleDateString()}</td>
                  <td><span className="badge badge-default">{ex.category}</span></td>
                  <td>{ex.description}</td>
                  <td><strong style={{ color: '#DC2626' }}>{formatCurrency(ex.amount)}</strong></td>
                  <td style={{ color: '#64748B', fontSize: '13px' }}>{ex.notes || '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openModal(ex)}><FiEdit2 /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ex._id || ex.id)}><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: '#64748B', padding: '32px' }}>No expenses yet. Add your first expense.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', width: '440px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ marginTop: 0 }}>{editing ? 'Edit Expense' : 'Add Expense'}</h2>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px' }}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)' }}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px' }}>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px' }}>Description *</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required placeholder="e.g. Monthly rent payment" style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px' }}>Amount (UGX) *</label>
                <input type="number" min="0" step="100" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required placeholder="0" style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '4px' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes..." style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '11px', background: '#16A34A', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Saving...' : editing ? 'Update' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
