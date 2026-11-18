import React, { useState, useEffect } from 'react';
import { FiSliders, FiRepeat, FiSearch, FiX, FiCheck, FiRefreshCw, FiDownload } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { InventoryAPI, ProductsAPI, BranchesAPI } from '../../services/api';
import InventoryTabs from './InventoryTabs';
import RepackModal from './RepackModal';
import './inventory.css';

const InventoryList = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Adjust Stock Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ productId: '', branchId: '', quantity: '', type: 'add', reason: '' });
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);

  // Repack Modal
  const [showRepackModal, setShowRepackModal] = useState(false);

  // Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ productId: '', fromBranchId: '', toBranchId: '', quantity: '' });
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  useEffect(() => {
    localStorage.removeItem('pos_inventory');
    localStorage.removeItem('pos_inventory_modified');
    fetchInventory();
    fetchProductsAndBranches();
    const handleBranchChange = () => fetchInventory();
    window.addEventListener('branchChanged', handleBranchChange);
    return () => window.removeEventListener('branchChanged', handleBranchChange);
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const activeBranchId = localStorage.getItem('active_branch_id');
      const res = await InventoryAPI.getInventory({ limit: 100, branchId: activeBranchId || undefined });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setInventory(res.data.data);
      }
    } catch (error) {
      console.error('Fetch inventory error:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchProductsAndBranches = async () => {
    try {
      const [pRes, bRes] = await Promise.all([
        ProductsAPI.getProducts({ limit: 100 }),
        BranchesAPI.getBranches(),
      ]);
      if (pRes.data?.data) setProducts(pRes.data.data);
      if (bRes.data?.data) {
        setBranches(bRes.data.data);
        // Auto-select first branch so user doesn't have to
        const activeBranchId = localStorage.getItem('active_branch_id');
        const defaultBranch = bRes.data.data.find(b => b._id === activeBranchId) || bRes.data.data[0];
        if (defaultBranch) {
          setAdjustForm(prev => ({ ...prev, branchId: defaultBranch._id }));
          setTransferForm(prev => ({ ...prev, fromBranchId: defaultBranch._id }));
        }
      }
    } catch { }
  };

  const filteredInventory = inventory.filter(item => {
    const name = item.product?.name || item.name || '';
    const sku = item.product?.sku || item.sku || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || sku.toLowerCase().includes(searchTerm.toLowerCase());
    const status = item.status || getStockStatus(item.quantity || item.stock).label;
    const matchesStatus = !statusFilter || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStockStatus = (qty) => {
    const q = Number(qty) || 0;
    if (q <= 0) return { label: 'Out of Stock', className: 'badge-danger' };
    if (q <= 10) return { label: 'Low Stock', className: 'badge-warning' };
    return { label: 'In Stock', className: 'badge-success' };
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (adjustSubmitting) return;
    if (!adjustForm.productId) return toast.error('Select a product');
    if (!adjustForm.quantity || Number(adjustForm.quantity) <= 0) return toast.error('Enter a valid quantity');
    setAdjustSubmitting(true);
    try {
      const res = await InventoryAPI.adjustStock(adjustForm);
      const newQty = res.data?.data?.quantity;
      toast.success(`Stock ${adjustForm.type === 'add' ? 'added' : adjustForm.type === 'remove' ? 'removed' : 'set'}! New quantity: ${newQty ?? ''}`);
      setShowAdjustModal(false);
      setAdjustForm(f => ({ productId: '', branchId: f.branchId, quantity: '', type: 'add', reason: '' }));
      fetchInventory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to adjust stock');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleTransferStock = async (e) => {
    e.preventDefault();
    if (transferSubmitting) return;
    if (!transferForm.quantity || Number(transferForm.quantity) <= 0) return toast.error('Enter a valid quantity');
    if (transferForm.fromBranchId === transferForm.toBranchId) return toast.error('Source and destination must be different');
    setTransferSubmitting(true);
    try {
      await InventoryAPI.transferStock(transferForm);
      toast.success('Stock transferred successfully');
      setShowTransferModal(false);
      setTransferForm({ productId: '', fromBranchId: '', toBranchId: '', quantity: '' });
      fetchInventory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to transfer stock');
    } finally {
      setTransferSubmitting(false);
    }
  };

  const exportInventoryCSV = () => {
    const rows = filteredInventory.map(item => {
      const qty = item.quantity ?? item.stock ?? 0;
      const status = item.status || getStockStatus(qty).label;
      return {
        Product: item.product?.name || item.name || '',
        SKU: item.product?.sku || item.sku || '',
        Branch: item.branch?.name || 'Main Branch',
        Stock: qty,
        ReorderLevel: item.reorderLevel || 10,
        Status: status,
      };
    });
    if (!rows.length) return toast.error('No data to export');
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'inventory.csv'; a.click();
    toast.success(`Exported ${rows.length} items`);
  };

  return (
    <div className="page-container">
      <InventoryTabs />
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Management</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Track stock levels, adjustments and transfers</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={exportInventoryCSV}>
            <FiDownload /> Export CSV
          </button>
          <button className="btn btn-outline" onClick={() => setShowAdjustModal(true)}>
            <FiSliders /> Adjust Stock
          </button>
          <button className="btn btn-outline" onClick={() => setShowRepackModal(true)}>
            <FiRepeat /> Repack
          </button>
          <button className="btn btn-secondary" onClick={() => setShowTransferModal(true)}>
            <FiRepeat /> Transfer Stock
          </button>
          <button className="btn btn-primary" onClick={fetchInventory} disabled={loading}>
            <FiRefreshCw style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <FiSearch style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
          <input
            type="text" className="form-input" style={{ paddingLeft: '40px' }}
            placeholder="Search products, SKU..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select className="form-select" style={{ width: '180px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
      </div>

      {/* Inventory Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#64748B', fontSize: '12px', textTransform: 'uppercase', fontWeight: 500, margin: '0 0 4px' }}>Total Items</p>
          <h3 style={{ margin: 0, fontSize: '24px', color: 'var(--text)' }}>{inventory.length}</h3>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#D97706', fontSize: '12px', textTransform: 'uppercase', fontWeight: 500, margin: '0 0 4px' }}>Low Stock</p>
          <h3 style={{ margin: 0, fontSize: '24px', color: '#D97706' }}>
            {inventory.filter(i => (i.status === 'Low Stock') || ((i.quantity || i.stock || 0) > 0 && (i.quantity || i.stock || 0) <= 10)).length}
          </h3>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#DC2626', fontSize: '12px', textTransform: 'uppercase', fontWeight: 500, margin: '0 0 4px' }}>Out of Stock</p>
          <h3 style={{ margin: 0, fontSize: '24px', color: '#DC2626' }}>
            {inventory.filter(i => (i.status === 'Out of Stock') || (i.quantity || i.stock || 0) <= 0).length}
          </h3>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading inventory...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Branch</th>
                <th>Current Stock</th>
                <th>Reorder Level</th>
                <th>Status</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map(item => {
                const qty = item.quantity ?? item.stock ?? 0;
                const status = item.status ? { label: item.status, className: item.status === 'Out of Stock' ? 'badge-danger' : item.status === 'Low Stock' ? 'badge-warning' : 'badge-success' } : getStockStatus(qty);
                return (
                  <tr key={item._id || item.id}>
                    <td><strong>{item.product?.name || item.name}</strong></td>
                    <td style={{ color: '#64748B', fontFamily: 'monospace', fontSize: '12px' }}>{item.product?.sku || item.sku}</td>
                    <td>{item.branch?.name || 'Main Branch'}</td>
                    <td>
                      <strong style={{ color: qty <= 0 ? '#EF4444' : qty <= 10 ? '#F59E0B' : '#16A34A' }}>
                        {qty}
                      </strong>
                    </td>
                    <td>{item.reorderLevel || 10}</td>
                    <td><span className={`badge ${status.className}`}>{status.label}</span></td>
                    <td style={{ color: '#64748B', fontSize: '13px' }}>
                      {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                );
              })}
              {filteredInventory.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>No inventory items found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Adjust Stock Modal ─────────────────────────────────────── */}
      {showAdjustModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdjustModal(false)}>
          <div className="inv-modal">
            <div className="modal-header">
              <h2>Adjust Stock</h2>
              <button className="modal-close" onClick={() => setShowAdjustModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleAdjustStock} className="modal-body">
              <div className="form-group">
                <label className="form-label">Product *</label>
                <select className="form-select" value={adjustForm.productId} onChange={e => setAdjustForm(p => ({ ...p, productId: e.target.value }))} required>
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Branch *</label>
                <select className="form-select" value={adjustForm.branchId} onChange={e => setAdjustForm(p => ({ ...p, branchId: e.target.value }))} required>
                  <option value="">Select Branch</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Type *</label>
                  <select className="form-select" value={adjustForm.type} onChange={e => setAdjustForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="add">Add Stock</option>
                    <option value="remove">Remove Stock</option>
                    <option value="set">Set to Exact</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity *</label>
                  <input className="form-input" type="number" min="0" value={adjustForm.quantity} onChange={e => setAdjustForm(p => ({ ...p, quantity: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input className="form-input" type="text" placeholder="e.g. Received new shipment" value={adjustForm.reason} onChange={e => setAdjustForm(p => ({ ...p, reason: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAdjustModal(false)} disabled={adjustSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={adjustSubmitting}><FiCheck /> {adjustSubmitting ? 'Adjusting...' : 'Adjust Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Transfer Stock Modal ───────────────────────────────────── */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowTransferModal(false)}>
          <div className="inv-modal">
            <div className="modal-header">
              <h2>Transfer Stock</h2>
              <button className="modal-close" onClick={() => setShowTransferModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleTransferStock} className="modal-body">
              <div className="form-group">
                <label className="form-label">Product *</label>
                <select className="form-select" value={transferForm.productId} onChange={e => setTransferForm(p => ({ ...p, productId: e.target.value }))} required>
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">From Branch *</label>
                  <select className="form-select" value={transferForm.fromBranchId} onChange={e => setTransferForm(p => ({ ...p, fromBranchId: e.target.value }))} required>
                    <option value="">Source</option>
                    {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">To Branch *</label>
                  <select className="form-select" value={transferForm.toBranchId} onChange={e => setTransferForm(p => ({ ...p, toBranchId: e.target.value }))} required>
                    <option value="">Destination</option>
                    {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity to Transfer *</label>
                <input className="form-input" type="number" min="1" value={transferForm.quantity} onChange={e => setTransferForm(p => ({ ...p, quantity: e.target.value }))} required />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowTransferModal(false)} disabled={transferSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={transferSubmitting}><FiRepeat /> {transferSubmitting ? 'Transferring...' : 'Transfer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRepackModal && (
        <RepackModal
          products={products}
          onClose={() => setShowRepackModal(false)}
          onSuccess={() => { fetchInventory(); fetchProductsAndBranches(); }}
        />
      )}
    </div>
  );
};

export default InventoryList;
