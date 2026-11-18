import React, { useState, useEffect } from 'react';
import { FiPackage, FiPlus, FiDownload, FiX, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ReturnsAPI, SalesAPI, InventoryAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import ReturnModal from '../returns/ReturnModal';

const StoreManagement = () => {
  const [activeTab, setActiveTab] = useState('returns');
  const [returns, setReturns] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAdj, setLoadingAdj] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  // Picking the real sale first (rather than free-typing an order number and
  // item names, as this form used to) is what lets Store Credit refunds work
  // here — it needs a real customerId, and createReturn needs real productIds
  // to validate against what was actually sold.
  const [saleSearch, setSaleSearch] = useState('');
  const [saleResults, setSaleResults] = useState([]);
  const [searchingSales, setSearchingSales] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);

  useEffect(() => {
    if (activeTab === 'returns') fetchReturns();
    if (activeTab === 'adjustments') fetchAdjustments();
  }, [activeTab]);

  const fetchAdjustments = async () => {
    setLoadingAdj(true);
    try {
      const res = await InventoryAPI.getAdjustments({ limit: 100 });
      if (res.data?.data) setAdjustments(res.data.data);
    } catch { toast.error('Failed to load adjustments'); }
    finally { setLoadingAdj(false); }
  };

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const res = await ReturnsAPI.getReturns({ limit: 50 });
      if (res.data?.data) setReturns(res.data.data);
    } catch { toast.error('Failed to load returns'); }
    finally { setLoading(false); }
  };

  const searchSales = async (q) => {
    setSaleSearch(q);
    if (!q || q.trim().length < 2) { setSaleResults([]); return; }
    setSearchingSales(true);
    try {
      const res = await SalesAPI.getSales({ search: q, status: 'completed', limit: 10 });
      if (res.data?.success) setSaleResults(res.data.data || []);
    } catch {
      // Non-fatal — the search box just won't show results this keystroke.
    } finally {
      setSearchingSales(false);
    }
  };

  const openModal = () => {
    setSaleSearch('');
    setSaleResults([]);
    setSelectedSale(null);
    setShowReturnModal(true);
  };

  const closeReturnFlow = () => {
    setShowReturnModal(false);
    setSelectedSale(null);
  };

  const exportReturns = () => {
    if (!returns.length) return toast.error('No data to export');
    const rows = returns.map(r => ({
      ReturnNum: r.returnNumber,
      Date: new Date(r.createdAt).toLocaleDateString(),
      Customer: r.customerName || '-',
      OriginalOrder: r.originalOrderNumber || '-',
      Total: r.totalAmount,
      Reason: r.reason,
      Refund: r.refundMethod
    }));
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'returns.csv'; a.click();
    toast.success('Exported!');
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Store Management</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Process returns, stock adjustments and warehouse operations
          </p>
        </div>
        {activeTab === 'returns' && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-outline" onClick={exportReturns}><FiDownload /> Export CSV</button>
            <button className="btn btn-primary" onClick={openModal}><FiPlus /> New Return</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('returns')}
          style={{
            padding: '10px 20px', border: 'none', background: 'transparent',
            color: activeTab === 'returns' ? '#16A34A' : '#64748B',
            fontWeight: activeTab === 'returns' ? 700 : 500,
            borderBottom: activeTab === 'returns' ? '2.5px solid #16A34A' : '2.5px solid transparent',
            cursor: 'pointer', fontSize: '14px', transition: 'all 0.2s', outline: 'none',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          ↩ Returns Processing
        </button>
        <button
          onClick={() => setActiveTab('adjustments')}
          style={{
            padding: '10px 20px', border: 'none', background: 'transparent',
            color: activeTab === 'adjustments' ? '#16A34A' : '#64748B',
            fontWeight: activeTab === 'adjustments' ? 700 : 500,
            borderBottom: activeTab === 'adjustments' ? '2.5px solid #16A34A' : '2.5px solid transparent',
            cursor: 'pointer', fontSize: '14px', transition: 'all 0.2s', outline: 'none',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          📦 Stock Adjustments
        </button>
      </div>

      {/* Returns Tab */}
      {activeTab === 'returns' && (
        <div className="table-container">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading returns...</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Return #</th><th>Date</th><th>Customer</th><th>Original Order</th>
                  <th>Items</th><th>Total Refund</th><th>Reason</th><th>Refund Method</th><th>Processed By</th>
                </tr>
              </thead>
              <tbody>
                {returns.map(r => (
                  <tr key={r._id}>
                    <td><strong style={{ color: '#D97706' }}>{r.returnNumber}</strong></td>
                    <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td>{r.customerName || '-'}</td>
                    <td>{r.originalOrderNumber || '-'}</td>
                    <td><span className="badge badge-default">{r.items?.length || 0}</span></td>
                    <td><strong style={{ color: '#DC2626' }}>{formatCurrency(r.totalAmount)}</strong></td>
                    <td><span className="badge badge-warning">{r.reason}</span></td>
                    <td>{r.refundMethod}</td>
                    <td style={{ fontSize: '13px', color: '#64748B' }}>{r.processedBy?.name || '-'}</td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>
                      No returns yet. Click <strong>+ New Return</strong> to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Adjustments Tab */}
      {activeTab === 'adjustments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '10px' }}>
            <button className="btn btn-outline" onClick={fetchAdjustments} disabled={loadingAdj}>
              <FiRefreshCw style={{ animation: loadingAdj ? 'spin 1s linear infinite' : 'none' }} /> Refresh
            </button>
          </div>
          <div className="table-container">
            {loadingAdj ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading adjustments...</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Type</th>
                    <th>Qty Changed</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Reason</th>
                    <th>Branch</th>
                    <th>Adjusted By</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map(a => (
                    <tr key={a._id}>
                      <td style={{ fontSize: '13px', color: '#64748B' }}>
                        {new Date(a.createdAt).toLocaleDateString()}<br />
                        <span style={{ fontSize: '11px' }}>{new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td><strong>{a.productId?.name || '-'}</strong></td>
                      <td style={{ fontSize: '12px', color: '#94A3B8' }}>{a.productId?.sku || '-'}</td>
                      <td>
                        <span style={{
                          padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                          background: a.adjustmentType === 'increase' ? '#DCFCE7' : '#FEE2E2',
                          color: a.adjustmentType === 'increase' ? '#16A34A' : '#DC2626'
                        }}>
                          {a.adjustmentType === 'increase' ? '▲ Add' : '▼ Remove'}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: a.adjustmentType === 'increase' ? '#16A34A' : '#DC2626' }}>
                          {a.adjustmentType === 'increase' ? '+' : '-'}{a.quantity}
                        </strong>
                      </td>
                      <td style={{ color: '#64748B' }}>{a.previousQuantity ?? '-'}</td>
                      <td><strong>{a.newQuantity ?? '-'}</strong></td>
                      <td>
                        <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '12px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                          {a.reason || 'correction'}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px' }}>{a.branchId?.name || 'Main Branch'}</td>
                      <td style={{ fontSize: '13px', color: '#64748B' }}>{a.adjustedBy?.name || '-'}</td>
                    </tr>
                  ))}
                  {adjustments.length === 0 && (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                        No stock adjustments yet. Go to <strong>Inventory</strong> and use <strong>Adjust Stock</strong> on any item.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Step 1: pick the original sale ──────────────────────────────── */}
      {showReturnModal && !selectedSale && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeReturnFlow()}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Select the Original Sale</h2>
              <button className="modal-close" onClick={closeReturnFlow}><FiX /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Search by order number or customer</label>
                <input
                  className="form-input"
                  autoFocus
                  value={saleSearch}
                  onChange={e => searchSales(e.target.value)}
                  placeholder="e.g. SO-2026-0064"
                />
              </div>
              {searchingSales && <p style={{ color: '#64748B', fontSize: '13px' }}>Searching...</p>}
              {!searchingSales && saleSearch.trim().length >= 2 && saleResults.length === 0 && (
                <p style={{ color: '#64748B', fontSize: '13px' }}>No completed sales found.</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {saleResults.map(s => (
                  <button
                    key={s._id || s.id}
                    type="button"
                    onClick={() => setSelectedSale(s)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '8px',
                      background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
                    }}
                  >
                    <strong>{s.orderNumber}</strong> — {s.customerName || 'Walk-in Customer'}
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      {new Date(s.createdAt).toLocaleDateString()} · {formatCurrency(s.grandTotal)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: pick items/reason/refund method (reuses the same flow as
          Sales → Return Items, so validation and Store Credit issuance stay
          identical everywhere a return can be started) ─────────────────── */}
      {selectedSale && (
        <ReturnModal
          sale={selectedSale}
          onClose={closeReturnFlow}
          onSuccess={() => { fetchReturns(); closeReturnFlow(); }}
        />
      )}
    </div>
  );
};

export default StoreManagement;
