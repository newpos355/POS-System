import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { FiDollarSign, FiShoppingCart, FiPackage, FiAlertCircle, FiMonitor, FiRefreshCw, FiTrendingUp, FiCreditCard } from 'react-icons/fi';
import { DashboardAPI } from '../../services/api';
import { ExtendedReportsAPI, ExpensesAPI } from '../../services/api';
import { formatCurrency, getCurrencySymbol } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';
import './Dashboard.css';

const PERIODS = [
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week',      label: 'This Week' },
  { id: 'month',     label: 'This Month' },
  { id: 'year',      label: 'This Year' },
];

const getPeriodDates = (period) => {
  const now = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  switch (period) {
    case 'yesterday': {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return { from: fmt(d), to: fmt(d) };
    }
    case 'week': {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      return { from: fmt(d), to: fmt(now) };
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(d), to: fmt(now) };
    }
    case 'year': {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: fmt(d), to: fmt(now) };
    }
    default: return { from: fmt(now), to: fmt(now) };
  }
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: '#0F172A', border: '1px solid #1E293B', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
        <p style={{ color: '#94A3B8', marginBottom: '4px' }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color || '#16A34A', margin: '2px 0', fontWeight: 600 }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const Dashboard = () => {
  const { user } = useAuth();
  const isCashier = user?.role === 'cashier';

  // Cashiers are locked to today (the backend enforces this too) — they get a
  // single "Today" chip instead of the period selector.
  const visiblePeriods = isCashier ? PERIODS.filter(p => p.id === 'today') : PERIODS;

  const [period, setPeriod]   = useState('today');
  const [data, setData]       = useState({ todaySales: 0, totalOrders: 0, totalProducts: 0, lowStockCount: 0, salesChartData: [], topProducts: [], recentSales: [], stockAlerts: [], totalOutstandingCredit: 0, creditCustomersCount: 0 });
  const [plData, setPlData]   = useState({ revenue: 0, cogs: 0, grossProfit: 0, grossMargin: 0, totalExpenses: 0, netProfit: 0 });
  const [loading, setLoading] = useState(true);

  // Guards against setState-after-unmount if the user navigates away while a
  // fetch is still in flight (React logs a warning, and without it a slow
  // response landing after navigation could momentarily flash stale state).
  // Must reset to true on mount, not just start true via useRef(true) — in
  // StrictMode (see main.jsx) React mounts, cleans up, and mounts again on
  // purpose in development, so a cleanup-only version of this ref gets set
  // to false by the first (simulated) unmount and never flips back, silently
  // blocking every setState in this component forever afterward.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const branchId = localStorage.getItem('active_branch_id');
      const dates = getPeriodDates(period);
      const [dashRes, plRes] = await Promise.allSettled([
        DashboardAPI.getDashboard(branchId ? { branchId, period } : { period }),
        // P&L is admin/manager-only on the backend (403 for cashiers) and none
        // of its cards render for cashiers — skip the wasted request.
        isCashier ? Promise.resolve(null) : ExtendedReportsAPI.getProfitLoss({ ...dates, branchId: branchId || undefined }),
      ]);
      if (!isMountedRef.current) return;
      if (dashRes.status === 'fulfilled' && dashRes.value.data?.data) {
        const d = dashRes.value.data.data;
        setData({ todaySales: d.todaySales || 0, totalOrders: d.totalOrders || 0, totalProducts: d.totalProducts || 0, lowStockCount: d.lowStockCount ?? 0, salesChartData: d.salesChartData || [], topProducts: d.topProducts || [], recentSales: d.recentSales || [], stockAlerts: d.stockAlerts || [], totalOutstandingCredit: d.totalOutstandingCredit || 0, creditCustomersCount: d.creditCustomersCount || 0 });
      }
      if (plRes.status === 'fulfilled' && plRes.value?.data?.data) {
        setPlData(plRes.value.data.data);
      }
    } catch {}
    finally { if (isMountedRef.current) setLoading(false); }
  }, [period, isCashier]);

  useEffect(() => {
    fetchAll();
    window.addEventListener('branchChanged', fetchAll);
    return () => window.removeEventListener('branchChanged', fetchAll);
  }, [fetchAll]);

  const chartData = (data.salesChartData || []).map(d => ({
    name: d.date?.length > 5 ? new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }) : d.date,
    sales: d.total || d.sales || 0,
  }));

  const sym = getCurrencySymbol();

  const statCards = [
    { title: `${PERIODS.find(p => p.id === period)?.label} Sales`, value: formatCurrency(data.todaySales), icon: <FiDollarSign />, colorClass: 'bg-green-light text-green', link: null, trend: 'Live data' },
    { title: 'Orders', value: data.totalOrders, icon: <FiShoppingCart />, colorClass: 'bg-blue-light text-blue', link: '/sales', trend: 'View all →' },
    ...(!isCashier ? [
      { title: 'Gross Profit', value: formatCurrency(plData.grossProfit || 0), icon: <FiTrendingUp />, colorClass: 'bg-purple-light text-purple', link: '/reports', trend: `Margin: ${plData.grossMargin || 0}%` },
    ] : []),
    { title: 'Total Products', value: data.totalProducts, icon: <FiPackage />, colorClass: 'bg-purple-light text-purple', link: '/products', trend: 'Manage →' },
    { title: 'Low Stock', value: data.lowStockCount, icon: <FiAlertCircle />, colorClass: 'bg-red-light text-red', link: '/inventory', trend: 'Check now →' },
    { title: 'Credit Outstanding', value: formatCurrency(data.totalOutstandingCredit), icon: <FiCreditCard />, colorClass: 'bg-red-light text-red', link: '/customers', trend: `${data.creditCustomersCount} customer${data.creditCustomersCount !== 1 ? 's' : ''} in debt →` },
  ];

  return (
    <div className="dashboard-container">
      {/* Period Selector */}
      <div className="dashboard-header">
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Dashboard Overview</h2>
        <div className="period-tabs">
          {visiblePeriods.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} className={`period-tab ${period === p.id ? 'active' : ''}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards-grid">
        {statCards.map((c, i) => (
          <div key={i} className="stat-card">
            <div className={`stat-icon ${c.colorClass}`}>{c.icon}</div>
            <div className="stat-info">
              <p className="stat-title">{c.title}</p>
              <h3 className="stat-value">{loading ? '...' : c.value}</h3>
              <span className="stat-trend positive">
                {c.link ? <Link to={c.link} style={{ color: 'inherit', textDecoration: 'none' }}>{c.trend}</Link> : c.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { label: '🖥 Open POS', to: '/pos', bg: 'linear-gradient(135deg,#16A34A,#059669)' },
          ...(!isCashier ? [{ label: '📊 P&L Report', to: '/reports', bg: 'linear-gradient(135deg,#7C3AED,#5B21B6)' }] : []),
          { label: '↩ Returns', to: '/store', bg: 'linear-gradient(135deg,#D97706,#B45309)' },
          { label: '🏷 Barcodes', to: '/barcodes', bg: 'linear-gradient(135deg,#2563EB,#1D4ED8)' },
          ...(!isCashier ? [{ label: '💸 Expenses', to: '/expenses', bg: 'linear-gradient(135deg,#DC2626,#B91C1C)' }] : []),
        ].map(btn => (
          <Link key={btn.to} to={btn.to} style={{ flex: 1, minWidth: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '13px 8px', background: btn.bg, color: 'white', borderRadius: '10px', textDecoration: 'none', fontWeight: 600, fontSize: '13px', border: 'none', cursor: 'pointer', transition: 'transform 0.15s', whiteSpace: 'nowrap' }}>
            {btn.label}
          </Link>
        ))}
        <button onClick={fetchAll} disabled={loading} style={{ padding: '13px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)', fontWeight: 500, fontSize: '13px' }}>
          <FiRefreshCw style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Charts Row */}
      <div className={`charts-row ${isCashier ? 'single' : ''}`}>
        {/* Sales Chart */}
        <div className="dashboard-card chart-card">
          <h3 className="card-title">Sales — {PERIODS.find(p => p.id === period)?.label}</h3>
          <div className="chart-container">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16A34A" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#16A34A" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#64748B', fontSize:12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill:'#64748B', fontSize:11}} tickFormatter={v => `${sym}${(v/1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="#16A34A" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#64748B' }}>
                {loading ? 'Loading...' : 'No sales data yet.'}
              </div>
            )}
          </div>
        </div>

        {/* Profit Summary */}
        {!isCashier && (
          <div className="dashboard-card" style={{ padding: '20px' }}>
            <h3 className="card-title">Profit Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              {[
                { label: 'Revenue', val: plData.revenue, color: '#16A34A' },
                { label: 'COGS (Cost of Sold Goods)', val: plData.cogs, color: '#64748B' },
                { label: 'Gross Profit', val: plData.grossProfit, color: '#2563EB', bold: true },
                { label: 'Expenses', val: plData.totalExpenses, color: '#D97706' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: '#64748B' }}>{row.label}</span>
                  <span style={{ fontSize: '14px', fontWeight: row.bold ? 800 : 600, color: row.color }}>{loading ? '...' : formatCurrency(row.val || 0)}</span>
                </div>
              ))}
            </div>
            <Link to="/reports" style={{ display: 'block', marginTop: '16px', textAlign: 'center', padding: '10px', background: '#F0FDF4', color: '#16A34A', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}>
              View Full P&L Report →
            </Link>
          </div>
        )}
      </div>

      {/* Bottom Row */}
      <div className="dashboard-grid-2">
        <div className="dashboard-card">
          <h3 className="card-title">Top Selling Products</h3>
          <div className="table-responsive">
            <table className="dashboard-table">
              <thead><tr><th>Rank</th><th>Product</th><th>Sold</th></tr></thead>
              <tbody>
                {data.topProducts.length > 0 ? data.topProducts.map((p, i) => (
                  <tr key={p.productId || i}>
                    <td><span className={`rank-badge ${i < 3 ? `rank-${i+1}` : ''}`}>{i+1}</span></td>
                    <td>{p.name}</td>
                    <td><strong>{p.quantitySold}</strong></td>
                  </tr>
                )) : <tr><td colSpan="3" style={{ textAlign: 'center', color: '#64748B', padding: '24px' }}>No sales yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3 className="card-title" style={{ margin: 0 }}>Recent Sales</h3>
            <Link to="/sales" className="btn-sm btn-outline" style={{ textDecoration: 'none' }}>View All</Link>
          </div>
          <div className="table-responsive" style={{ marginTop: '12px' }}>
            <table className="dashboard-table">
              <thead><tr><th>Order #</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {data.recentSales.length > 0 ? data.recentSales.map((s, i) => (
                  <tr key={s._id || i}>
                    <td><Link to={`/sales/${s._id}`} style={{ color: '#16A34A', textDecoration: 'none' }}>{s.orderNumber}</Link></td>
                    <td>{s.customerName || 'Walk-in'}</td>
                    <td><strong>{formatCurrency(s.grandTotal)}</strong></td>
                    <td><span className={`status-badge ${s.status === 'voided' ? 'status-voided' : 'status-completed'}`}>{s.status === 'voided' ? 'Voided' : 'Done'}</span></td>
                  </tr>
                )) : <tr><td colSpan="4" style={{ textAlign: 'center', color: '#64748B', padding: '24px' }}>No sales yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
