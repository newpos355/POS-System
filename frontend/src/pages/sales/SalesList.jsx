import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiMonitor, FiEye, FiXCircle, FiPlus, FiDownload, FiSearch, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { SalesAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import QuickCreateCustomerModal from '../../components/QuickCreateCustomerModal';
import './sales.css';

const PAYMENT_OPTIONS = [
  { label: 'All Methods', value: 'All' },
  { label: 'Cash', value: 'Cash' },
  { label: 'Credit Sale', value: 'Credit' },
  // { label: 'Card', value: 'Card' },
  { label: 'Pesapal', value: 'Pesapal' },
];

const SalesList = () => {
  const [allSales, setAllSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState('All');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Initial load & branch listener
  useEffect(() => {
    loadSales();
    window.addEventListener('branchChanged', loadSales);
    return () => window.removeEventListener('branchChanged', loadSales);
  }, []);

  const loadSales = async () => {
    try {
      setLoading(true);
      const branchId = localStorage.getItem('active_branch_id');
      const query = { limit: 500, ...(branchId ? { branchId } : {}) };
      const res = await SalesAPI.getSales(query);
      if (res.data?.success && Array.isArray(res.data.data)) {
        setAllSales(res.data.data);
      }
    } catch {
      toast.error('Failed to load sales history');
    } finally {
      setLoading(false);
    }
  };

  // ⚡ INSTANT REAL-TIME FILTERING ⚡
  const filteredSales = useMemo(() => {
    return allSales.filter(sale => {
      // 1. Payment Method Filter
      if (filterPayment !== 'All') {
        const method = String(sale.paymentMethod || '').toLowerCase().trim();
        const selected = filterPayment.toLowerCase().trim();

        if (selected === 'cash') {
          if (!method.includes('cash') || method.includes('credit')) return false;
        } else if (selected === 'credit') {
          if (!method.includes('credit') && !method.includes('pay later')) return false;
        } else if (selected === 'card') {
          if (!method.includes('card') && !method.includes('visa') && !method.includes('master')) return false;
        } else if (selected === 'airtel') {
          if (!method.includes('airtel')) return false;
        } else if (selected === 'mtn') {
          if (!method.includes('mtn') && !method.includes('momo')) return false;
        } else if (selected === 'pesapal') {
          if (!method.includes('pesapal')) return false;
        } else {
          if (!method.includes(selected)) return false;
        }
      }

      // 2. Search Box Filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const orderNo = String(sale.orderNumber || '').toLowerCase();
        const custName = String(sale.customer?.name || sale.customerName || '').toLowerCase();
        const custPhone = String(sale.customer?.phone || '').toLowerCase();
        const cashier = String(sale.cashierId?.name || '').toLowerCase();

        if (!orderNo.includes(q) && !custName.includes(q) && !custPhone.includes(q) && !cashier.includes(q)) {
          return false;
        }
      }

      // 3. Date From
      if (filterFrom) {
        const saleDate = new Date(sale.createdAt || sale.date);
        const fromDate = new Date(filterFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (saleDate < fromDate) return false;
      }

      // 4. Date To
      if (filterTo) {
        const saleDate = new Date(sale.createdAt || sale.date);
        const toDate = new Date(filterTo);
        toDate.setHours(23, 59, 59, 999);
        if (saleDate > toDate) return false;
      }

      return true;
    });
  }, [allSales, filterPayment, search, filterFrom, filterTo]);

  const clearFilters = () => {
    setSearch('');
    setFilterPayment('All');
    setFilterFrom('');
    setFilterTo('');
  };

  const hasFilters = Boolean(search || filterPayment !== 'All' || filterFrom || filterTo);

  const handleVoid = async (id) => {
    if (!window.confirm('Void this sale? This action cannot be undone.')) return;
    try {
      await SalesAPI.voidSale(id);
      toast.success('Sale voided');
      setAllSales(prev => prev.map(s => (s.id || s._id) === id ? { ...s, status: 'voided' } : s));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to void sale');
    }
  };

  const exportCSV = () => {
    if (!filteredSales.length) return toast.error('No data to export');
    const rows = filteredSales.map(s => ({
      OrderNumber: s.orderNumber,
      Date: new Date(s.createdAt || s.date).toLocaleString(),
      Customer: s.customer?.name || s.customerName || 'Walk-in Customer',
      Cashier: s.cashierId?.name || '-',
      ItemsCount: s.items?.length || 0,
      GrandTotal: s.grandTotal || s.total || 0,
      AmountPaid: (s.paymentMethod || '').toLowerCase().includes('credit')
        ? (s.paymentDetails?.amountPaid ?? 0)
        : (s.grandTotal || s.total || 0),
      BalanceDue: (s.paymentMethod || '').toLowerCase().includes('credit')
        ? (s.paymentDetails?.balanceDue ?? 0)
        : 0,
      PaymentMethod: s.paymentMethod || 'Cash',
      Status: s.status,
    }));

    const csv = [
      Object.keys(rows[0]).join(','),
      ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Sales_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Exported to CSV!');
  };

  const isCredit = (s) => (s.paymentMethod || '').toLowerCase().includes('credit');

  return (
    <div className="sales-page-container">
      {/* ── Top Header ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
            Sales History
          </h1>
          <p style={{ color: '#64748B', fontSize: '11px', margin: '2px 0 0' }}>
            View transactions, partial credit payments, and receipts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Link to="/due-bills" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: '11.5px' }}>
            💳 Due Bills
          </Link>
          <Link to="/shifts" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: '11.5px' }}>
            🕐 Shifts
          </Link>
          <button className="btn btn-outline" onClick={() => setShowNewCustomer(true)} style={{ padding: '5px 10px', fontSize: '11.5px' }}>
            <FiPlus /> New Customer
          </button>
          <button className="btn btn-outline" onClick={exportCSV} style={{ padding: '5px 10px', fontSize: '11.5px' }}>
            <FiDownload /> Export CSV
          </button>
          <Link to="/pos" className="btn btn-primary" style={{ background: '#16A34A', borderColor: '#16A34A', padding: '5px 12px', fontSize: '11.5px', color: '#fff', fontWeight: 700 }}>
            <FiMonitor /> Open POS
          </Link>
        </div>
      </div>

      {/* ── Single Line Horizontal Filter Card ───────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'flex-end',
          gap: '12px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '14px',
          // boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Search */}
        <div style={{ flex: '1 1 auto', minWidth: '180px' }}>
          <label className="sales-filter-label">Search</label>
          <div style={{ position: 'relative' }}>
            <FiSearch style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '12px' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Customer, phone, order #..."
              className="sales-filter-input"
              style={{ width: '100%', paddingLeft: '26px' }}
            />
          </div>
        </div>

        {/* Payment Method Selector */}
        <div style={{ flex: '0 0 160px', width: '160px' }}>
          <label className="sales-filter-label">Payment Method</label>
          <select
            value={filterPayment}
            onChange={e => setFilterPayment(e.target.value)}
            className="sales-filter-select"
            style={{ width: '100%' }}
          >
            {PAYMENT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* From Date */}
        <div style={{ flex: '0 0 135px', width: '135px' }}>
          <label className="sales-filter-label">From Date</label>
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="sales-filter-input"
            style={{ width: '100%' }}
          />
        </div>

        {/* To Date */}
        <div style={{ flex: '0 0 135px', width: '135px' }}>
          <label className="sales-filter-label">To Date</label>
          <input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="sales-filter-input"
            style={{ width: '100%' }}
          />
        </div>

        {/* Clear Filters Button */}
        {hasFilters && (
          <div style={{ flex: '0 0 auto' }}>
            <button
              onClick={clearFilters}
              className="btn"
              style={{
                background: '#F1F5F9',
                color: '#475569',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                height: '32px',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <FiX /> Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Compact Table ───────────────────────────────────────────────────────── */}
      <div className="sales-table-wrapper">
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '12px' }}>Loading sales history...</div>
        ) : filteredSales.length === 0 ? (
          <div style={{ padding: '35px', textAlign: 'center', color: '#64748B', fontSize: '12px' }}>
            <div style={{ fontSize: '20px', marginBottom: '2px' }}>🔍</div>
            <strong>No matching sales found</strong>
            <p style={{ margin: '2px 0 8px', fontSize: '11px' }}>
              {hasFilters ? 'Try changing or clearing your filters.' : 'No sales recorded yet.'}
            </p>
            {hasFilters && <button onClick={clearFilters} className="btn btn-outline btn-sm" style={{ padding: '3px 8px', fontSize: '11px' }}>Clear Filters</button>}
          </div>
        ) : (
          <table className="compact-sales-table">
            <thead>
              <tr>
                <th style={{ width: '110px' }}>Order #</th>
                <th style={{ width: '135px' }}>Date / Time</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th style={{ textAlign: 'center', width: '50px' }}>Items</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Balance Due</th>
                <th>Payment</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', width: '70px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale, idx) => {
                const credit = isCredit(sale);
                const grandTot = sale.grandTotal || sale.total || 0;
                const amtPaid = credit ? (sale.paymentDetails?.amountPaid ?? 0) : grandTot;
                const balDue = credit ? (sale.paymentDetails?.balanceDue ?? Math.max(0, grandTot - amtPaid)) : 0;

                return (
                  <tr key={sale.id || sale._id || idx} style={{ opacity: sale.status === 'voided' ? 0.55 : 1 }}>
                    {/* Order # */}
                    <td>
                      <strong style={{ fontFamily: 'monospace', color: '#0F172A', fontSize: '11.5px' }}>
                        {sale.orderNumber}
                      </strong>
                    </td>

                    {/* Date / Time */}
                    <td style={{ color: '#475569', fontSize: '11px' }}>
                      {new Date(sale.createdAt || sale.date).toLocaleDateString('en-GB')}, {new Date(sale.createdAt || sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    {/* Customer */}
                    <td style={{ fontWeight: 600, color: '#1E293B' }}>
                      {sale.customer?.name || sale.customerName || <span style={{ color: '#94A3B8', fontWeight: 400, fontStyle: 'italic' }}>Walk-in</span>}
                    </td>

                    {/* Cashier */}
                    <td style={{ color: '#64748B' }}>
                      {sale.cashierId?.name || '-'}
                    </td>

                    {/* Items */}
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: '#F1F5F9', color: '#334155', borderRadius: '10px', padding: '1px 6px', fontSize: '10.5px', fontWeight: 700 }}>
                        {sale.items?.length || 0}
                      </span>
                    </td>

                    {/* Total */}
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                      {formatCurrency(grandTot)}
                    </td>

                    {/* Paid */}
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>
                      {formatCurrency(amtPaid)}
                    </td>

                    {/* Balance Due */}
                    <td style={{ textAlign: 'right' }}>
                      {balDue > 0 ? (
                        <span style={{ color: '#DC2626', fontWeight: 800 }}>
                          {formatCurrency(balDue)}
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>—</span>
                      )}
                    </td>

                    {/* Payment Method */}
                    <td>
                      <span style={{ textTransform: 'capitalize', fontWeight: 600, color: credit ? '#B45309' : '#0F172A' }}>
                        {(sale.paymentMethod || 'Cash').replace('_', ' ')}
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`badge-compact ${sale.status === 'voided' ? 'status-voided-badge' : credit ? 'status-credit-badge' : 'status-completed-badge'}`}>
                        {sale.status === 'voided' ? 'Voided' : credit ? (balDue > 0 ? 'Credit (Unpaid)' : 'Credit (Paid)') : 'Completed'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        <Link to={`/sales/${sale.id || sale._id}`} className="btn" style={{ padding: '2px 6px', fontSize: '11px' }} title="View">
                          <FiEye />
                        </Link>
                        {sale.status !== 'voided' && (
                          <button onClick={() => handleVoid(sale.id || sale._id)} className="btn" style={{ padding: '2px 6px', fontSize: '11px' }} title="Void">
                            <FiXCircle />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNewCustomer && (
        <QuickCreateCustomerModal onClose={() => setShowNewCustomer(false)} onCreated={() => loadSales()} />
      )}
    </div>
  );
};

export default SalesList;
