import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { PriceListsAPI, ProductsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import InventoryTabs from './InventoryTabs';
import { useAuth } from '../../contexts/AuthContext';

// Named price schemes assignable to customers (Customers → edit → Price
// List). The POS applies the selected customer's list automatically.
const PriceListsPage = () => {
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const canManage = ['admin', 'manager'].includes(role);
  const isAdmin = role === 'admin';
  const [priceLists, setPriceLists] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | priceList object

  useEffect(() => {
    fetchLists();
    ProductsAPI.getProducts({ limit: 200 })
      .then(res => { if (res.data?.data) setProducts(res.data.data); })
      .catch(() => {});
  }, []);

  const fetchLists = async () => {
    try {
      setLoading(true);
      const res = await PriceListsAPI.getPriceLists();
      if (res.data?.success) setPriceLists(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load price lists');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (pl) => {
    if (!window.confirm(`Delete price list "${pl.name}"? ${pl.customerCount || 0} customer(s) will fall back to standard prices.`)) return;
    try {
      await PriceListsAPI.deletePriceList(pl._id);
      toast.success('Price list deleted');
      fetchLists();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete price list');
    }
  };

  return (
    <div className="page-container">
      <InventoryTabs />
      <div className="page-header">
        <div>
          <h1 className="page-title">Price Lists</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Special pricing schemes (wholesale, VIP...). Assign one to a customer and the POS applies it automatically.
          </p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <FiPlus /> New Price List
          </button>
        )}
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading price lists...</div>
        ) : priceLists.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            No price lists yet. Create one, then assign it to customers from the customer form.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Coverage</th>
                <th style={{ textAlign: 'center' }}>Customers</th>
                <th>Status</th>
                {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {priceLists.map(pl => (
                <tr key={pl._id}>
                  <td>
                    <strong>{pl.name}</strong>
                    {pl.description && <div style={{ fontSize: '12px', color: '#64748B' }}>{pl.description}</div>}
                  </td>
                  <td>
                    {pl.type === 'percent'
                      ? <span className="badge badge-info">{pl.percentage > 0 ? `+${pl.percentage}%` : `${pl.percentage}%`} on everything</span>
                      : <span className="badge badge-default">Per-item prices</span>}
                  </td>
                  <td>{pl.type === 'percent' ? 'All products' : `${pl.items?.length || 0} product(s)`}</td>
                  <td style={{ textAlign: 'center' }}>{pl.customerCount || 0}</td>
                  <td>{pl.isActive
                    ? <span className="badge badge-success">Active</span>
                    : <span className="badge badge-default">Inactive</span>}</td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setEditing(pl)}>
                          <FiEdit2 /> Edit
                        </button>
                        {isAdmin && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(pl)}>
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <PriceListEditor
          priceList={editing === 'new' ? null : editing}
          products={products}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); fetchLists(); }}
        />
      )}
    </div>
  );
};

const PriceListEditor = ({ priceList, products, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    name: priceList?.name || '',
    description: priceList?.description || '',
    type: priceList?.type || 'per_item',
    percentage: priceList?.percentage ?? 0,
    isActive: priceList?.isActive ?? true,
  });
  const [items, setItems] = useState(() =>
    (priceList?.items || []).map(i => ({
      productId: i.productId?._id || i.productId,
      customPrice: i.customPrice,
    })));
  const [pickerProductId, setPickerProductId] = useState('');
  const [saving, setSaving] = useState(false);

  const productOf = (id) => products.find(p => p._id === id);
  const available = products.filter(p => !items.some(i => i.productId === p._id));

  const addItem = () => {
    const p = productOf(pickerProductId);
    if (!p) return;
    setItems(prev => [...prev, { productId: p._id, customPrice: p.price }]);
    setPickerProductId('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('A name is required');
    if (form.type === 'per_item' && items.length === 0) {
      return toast.error('Add at least one product price (or switch to percentage type)');
    }
    setSaving(true);
    try {
      const payload = { ...form, percentage: Number(form.percentage) || 0, items };
      const res = priceList
        ? await PriceListsAPI.updatePriceList(priceList._id, payload)
        : await PriceListsAPI.createPriceList(payload);
      if (res.data?.success) {
        toast.success(priceList ? 'Price list updated' : 'Price list created');
        onSuccess();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save price list');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '620px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '16px' }}>{priceList ? `Edit "${priceList.name}"` : 'New Price List'}</h2>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Wholesale" />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="per_item">Per-item custom prices</option>
                <option value="percent">Percentage on all products</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
          </div>

          {form.type === 'percent' ? (
            <div className="form-group" style={{ marginBottom: '16px', maxWidth: '280px' }}>
              <label className="form-label">Percentage (negative = discount)</label>
              <input className="form-input" type="number" min="-100" step="any" value={form.percentage}
                onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} />
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                e.g. -10 sells everything at 10% below standard price
              </span>
            </div>
          ) : (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <select className="form-select" style={{ flex: 1 }} value={pickerProductId}
                  onChange={e => setPickerProductId(e.target.value)}>
                  <option value="">Add a product...</option>
                  {available.map(p => (
                    <option key={p._id} value={p._id}>{p.name} — std {formatCurrency(p.price)}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-outline" onClick={addItem} disabled={!pickerProductId}>
                  <FiPlus /> Add
                </button>
              </div>
              {items.length > 0 && (
                <table className="data-table">
                  <thead>
                    <tr><th>Product</th><th style={{ width: '120px' }}>Std Price</th><th style={{ width: '140px' }}>List Price</th><th style={{ width: '50px' }}></th></tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const p = productOf(item.productId);
                      return (
                        <tr key={item.productId}>
                          <td>{p?.name || 'Unknown product'}</td>
                          <td>{p ? formatCurrency(p.price) : '-'}</td>
                          <td>
                            <input className="form-input" type="number" min="0" step="any" value={item.customPrice}
                              onChange={e => setItems(prev => prev.map((it, i) =>
                                i === idx ? { ...it, customPrice: Number(e.target.value) } : it))} />
                          </td>
                          <td>
                            <button type="button" className="btn btn-danger btn-sm"
                              onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>
                              <FiTrash2 />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
            Active (inactive lists are ignored at the POS)
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Price List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PriceListsPage;
