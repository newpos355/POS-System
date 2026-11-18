import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiSearch, FiEdit2, FiTrash2, FiDownload, FiUpload, FiGrid, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ProductsAPI, CategoriesAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import './products.css';

// ── Expiry status helper ───────────────────────────────────────────────────────
const getExpiryStatus = (expiryDate, alertDays = 30) => {
  if (!expiryDate) return null;
  const today    = new Date();
  const exp      = new Date(expiryDate);
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)         return { label: 'Expired',        color: '#DC2626', bg: '#FEE2E2', diffDays };
  if (diffDays <= alertDays) return { label: `${diffDays}d left`, color: '#D97706', bg: '#FEF3C7', diffDays };
  return                           { label: `${diffDays}d left`, color: '#16A34A', bg: '#DCFCE7', diffDays };
};


const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    // Clear legacy localStorage cache
    localStorage.removeItem('pos_products');
    localStorage.removeItem('pos_products_modified');
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await ProductsAPI.getProducts();
      if (res.data?.success && Array.isArray(res.data.data)) {
        setProducts(res.data.data);
      }
    } catch (error) {
      console.error('Fetch products error:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await CategoriesAPI.getCategories();
      if (res.data?.success && Array.isArray(res.data.data)) setCategories(res.data.data);
    } catch (error) { console.error('Fetch categories error:', error); }
  };

  const exportCSV = () => {
    if (!products.length) return toast.error('No products to export');
    const rows = products.map(p => ({ Name: p.name, SKU: p.sku, Category: getCategoryName(p), Price: p.price, CostPrice: p.costPrice || 0, Stock: p.stock, ReorderLevel: p.reorderLevel || 10 }));
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'products.csv'; a.click();
    toast.success(`Exported ${products.length} products!`);
  };

  const importCSV = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const lines = text.trim().split('\n'); if (lines.length < 2) return toast.error('Empty CSV');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    let created = 0, failed = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',');
      const row = {}; headers.forEach((h, idx) => { row[h] = vals[idx]?.trim(); });
      if (!row.name) continue;
      try {
        await ProductsAPI.createProduct({ name: row.name, sku: row.sku || '', price: Number(row.price) || 0, costPrice: Number(row.costprice) || 0, stock: Number(row.stock) || 0, reorderLevel: Number(row.reorderlevel) || 10 });
        created++;
      } catch { failed++; }
    }
    toast.success(`Imported: ${created} products${failed ? `, ${failed} failed` : ''}`);
    fetchProducts();
    e.target.value = '';
  };

  // Quick Add Category modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const handleAddCategory = async (ev) => {
    ev.preventDefault(); if (!catName.trim()) return;
    setCatSaving(true);
    try {
      await CategoriesAPI.createCategory({ name: catName.trim() });
      toast.success(`Category "${catName}" created!`);
      setCatName(''); setShowCatModal(false); fetchCategories();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setCatSaving(false); }
  };

  const fileInputRef = useRef(null);

  const getCategoryName = (product) => {
    if (!product) return 'Uncategorized';
    if (product.categoryId?.name) return product.categoryId.name;
    if (typeof product.category === 'string') return product.category;
    if (typeof product.category === 'object' && product.category?.name) return product.category.name;
    return 'Uncategorized';
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await ProductsAPI.deleteProduct(id);
      toast.success('Product deleted successfully');
      fetchProducts(); // Reload live list
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete product');
    }
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          product.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const catName = getCategoryName(product);
    const matchesCategory = categoryFilter ? catName.toLowerCase() === categoryFilter.toLowerCase() : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="page-container">
      {/* ── Expiry Warning Banner ── */}
      {(() => {
        const urgent = filteredProducts.filter(p => {
          const st = getExpiryStatus(p.expiryDate, p.expiryAlertDays);
          return st && st.diffDays <= (p.expiryAlertDays || 30);
        });
        if (!urgent.length) return null;
        const expiredCount  = urgent.filter(p => getExpiryStatus(p.expiryDate).diffDays < 0).length;
        const expiringCount = urgent.length - expiredCount;
        return (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>
            <FiAlertTriangle />
            {expiredCount > 0 && <span>⛔ {expiredCount} product{expiredCount > 1 ? 's' : ''} EXPIRED</span>}
            {expiredCount > 0 && expiringCount > 0 && <span style={{ color: '#94A3B8' }}>|</span>}
            {expiringCount > 0 && <span style={{ color: '#D97706' }}>⚠️ {expiringCount} expiring soon</span>}
            <span style={{ marginLeft: 'auto', fontWeight: 400, color: '#64748B' }}>Edit each product to review or update expiry dates.</span>
          </div>
        );
      })()}
      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Manage product catalog, pricing and inventory</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" onClick={() => setShowCatModal(true)}><FiGrid /> Add Category</button>
          <button className="btn btn-outline" onClick={exportCSV}><FiDownload /> Export CSV</button>
          <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}><FiUpload /> Import CSV</button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={importCSV} style={{ display: 'none' }} />
          <Link to="/products/new" className="btn btn-primary"><FiPlus /> Add Product</Link>
        </div>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <FiSearch style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '40px' }}
              placeholder="Search by name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="form-select"
            style={{ width: '200px' }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id || cat._id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading products from database...</div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>No products found. Click "+ Add Product" to create one.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Image</th>
                <th>Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Expiry</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id || product._id}>
                  <td>
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#F1F5F9' }}>
                      {product.image ? (
                        <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#94A3B8' }}>N/A</div>
                      )}
                    </div>
                  </td>
                  <td><strong>{product.name}</strong></td>
                  <td style={{ color: '#64748B', fontFamily: 'monospace' }}>{product.sku}</td>
                  <td><span className="badge badge-info">{getCategoryName(product)}</span></td>
                  <td><strong>{formatCurrency(product.price)}</strong></td>
                  <td>{product.stock}</td>
                  <td>
                    {(() => {
                      const st = getExpiryStatus(product.expiryDate, product.expiryAlertDays);
                      if (!st) return <span style={{ color: '#94A3B8', fontSize: '12px' }}>N/A</span>;
                      return (
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td>
                    <span className={`badge ${product.stock > 10 ? 'badge-success' : product.stock > 0 ? 'badge-warning' : 'badge-danger'}`}>
                      {product.stock > 10 ? 'In Stock' : product.stock > 0 ? 'Low Stock' : 'Out of Stock'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Link to={`/products/${product.id || product._id}/edit`} className="btn btn-outline btn-sm">
                        <FiEdit2 /> Edit
                      </Link>
                      <button onClick={() => handleDelete(product.id || product._id)} className="btn btn-danger btn-sm">
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick Add Category Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatModal(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', width: '360px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ marginTop: 0 }}>Add Category</h3>
            <form onSubmit={handleAddCategory}>
              <input type="text" value={catName} onChange={e => setCatName(e.target.value)} placeholder="Category name" autoFocus required style={{ width: '100%', padding: '11px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', boxSizing: 'border-box', fontSize: '14px', marginBottom: '16px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowCatModal(false)} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={catSaving} style={{ flex: 2, padding: '10px', background: '#16A34A', color: 'white', border: 'none', borderRadius: '8px', cursor: catSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>{catSaving ? 'Saving...' : 'Create Category'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductList;
