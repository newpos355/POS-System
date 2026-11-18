import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import { FiDownload, FiTrendingUp, FiPackage, FiShoppingCart, FiRefreshCw, FiDollarSign, FiActivity, FiArrowUp, FiArrowDown, FiArchive, FiPrinter, FiCalendar, FiSliders, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ReportsAPI, ExtendedReportsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';
import ReceivablesReport from './ReceivablesReport';
import PayablesReport from './PayablesReport';
import CustomReportBuilder from './CustomReportBuilder';
import ScheduledReports from './ScheduledReports';
import './reports.css';

const COLORS = ['#16A34A', '#2563EB', '#D97706', '#DC2626', '#7C3AED'];
const formatDate = (str) => {
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return str; }
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#0F172A', border: '1px solid #1E293B', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
        <p style={{ color: '#94A3B8', marginBottom: '4px' }}>{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color || '#16A34A', margin: '2px 0', fontWeight: '600' }}>
            {entry.name}: {entry.name.toLowerCase().includes('sales') || entry.name.toLowerCase().includes('revenue') || entry.name.toLowerCase().includes('spend') ? formatCurrency(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const DEFAULT_SALES_REPORT = {
  totalRevenue: 28450.00,
  totalOrders: 342,
  averageOrderValue: 83.18,
  topCategory: 'Electronics',
  chartData: [
    { date: 'Mon', sales: 3200 },
    { date: 'Tue', sales: 4100 },
    { date: 'Wed', sales: 3800 },
    { date: 'Thu', sales: 5200 },
    { date: 'Fri', sales: 4900 },
    { date: 'Sat', sales: 6100 },
    { date: 'Sun', sales: 4150 },
  ],
  dailyBreakdown: [
    { date: new Date().toISOString().split('T')[0], orders: 45, gross: 4500, discount: 120, net: 4380 },
    { date: new Date(Date.now() - 86400000).toISOString().split('T')[0], orders: 38, gross: 3800, discount: 90, net: 3710 },
    { date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], orders: 52, gross: 5200, discount: 200, net: 5000 },
  ],
  paymentBreakdown: { cash: 14200, card: 8750, mobile_money: 5500 },
};

const DEFAULT_INVENTORY_REPORT = {
  totalProducts: 142,
  lowStockItems: 4,
  outOfStockItems: 1,
  totalValuation: 84920.00,
  categoryBreakdown: [
    { category: 'Electronics', count: 45, value: 52000 },
    { category: 'Groceries', count: 38, value: 8200 },
    { category: 'Clothing', count: 29, value: 12500 },
    { category: 'Beverages', count: 18, value: 4100 },
    { category: 'Others', count: 12, value: 8120 },
  ],
  lowStockList: [
    { name: 'Wireless Ergonomic Mouse', sku: 'SKU-LOG-MX', quantity: 2, reorderLevel: 5 },
    { name: 'USB-C Fast Charger 65W', sku: 'SKU-ANK-65W', quantity: 1, reorderLevel: 10 },
    { name: 'Organic Almond Milk', sku: 'SKU-GRC-ALM', quantity: 0, reorderLevel: 8 },
    { name: 'Mechanical Keyboard RGB', sku: 'SKU-MK-RGB', quantity: 3, reorderLevel: 5 },
  ],
};

const DEFAULT_PURCHASE_REPORT = {
  totalSpend: 17670.50,
  outstandingBills: 3400.00,
  totalVendors: 3,
  totalOrders: 12,
  receivedOrders: 9,
  pendingOrders: 3,
  topVendors: [
    { name: 'Global Tech Distributors', totalSpend: 12450 },
    { name: 'Fresh Organic Foods Co.', totalSpend: 1820.50 },
    { name: 'Apparel Wholesale Supplies', totalSpend: 3400 },
  ],
};

const Reports = () => {
  const { user } = useAuth();
  const isCashier = user?.role === 'cashier';

  const [activeTab, setActiveTab] = useState('sales');
  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState(DEFAULT_SALES_REPORT);
  const [inventoryData, setInventoryData] = useState(DEFAULT_INVENTORY_REPORT);
  const [purchaseData, setPurchaseData] = useState(DEFAULT_PURCHASE_REPORT);

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  // Cashiers only see today's figures — the backend enforces the same clamp.
  const [dateRange, setDateRange] = useState(
    isCashier ? { from: today, to: today } : { from: thirtyDaysAgo, to: today }
  );

  const [plData, setPlData] = useState(null);
  const [cashFlowData, setCashFlowData] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [extLoading, setExtLoading] = useState(false);

  // ── Archive state ────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const [archivePeriodType, setArchivePeriodType] = useState('month'); // 'month' | 'year'
  const [archiveMonth, setArchiveMonth] = useState(`${currentYear}-${currentMonth}`);
  const [archiveYear, setArchiveYear] = useState(String(currentYear));
  const [archiveData, setArchiveData] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const fetchArchive = useCallback(async () => {
    setArchiveLoading(true);
    setArchiveData(null);
    try {
      const period = archivePeriodType === 'year' ? archiveYear : archiveMonth;
      const res = await ExtendedReportsAPI.getFinancialStatement({ period, type: archivePeriodType });
      if (res.data?.success) {
        setArchiveData(res.data.data);
        toast.success('Financial statement loaded');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load financial statement');
    } finally {
      setArchiveLoading(false);
    }
  }, [archivePeriodType, archiveMonth, archiveYear]);

  const exportArchiveCSV = () => {
    if (!archiveData) return toast.error('Load a statement first');
    const { summary, cashFlow, paymentBreakdown, expenseBreakdown, dailySales, expenseRows, topProducts } = archiveData;
    const lines = [
      `FINANCIAL STATEMENT — ${archiveData.period} (${archiveData.periodType})`,
      `Generated: ${new Date(archiveData.generatedAt).toLocaleString()}`,
      '',
      '=== INCOME STATEMENT ===',
      'Metric,Amount',
      `Total Revenue,${summary.totalRevenue}`,
      `Cost of Goods Sold (COGS),${summary.cogs}`,
      `Gross Profit,${summary.grossProfit}`,
      `Gross Margin,${summary.grossMargin}%`,
      `Total Expenses,${summary.totalExpenses}`,
      `Net Profit,${summary.netProfit}`,
      `Net Margin,${summary.netMargin}%`,
      `Total Orders,${summary.totalOrders}`,
      `Total Purchase Spend,${summary.totalPurchaseSpend}`,
      `Outstanding Bills,${summary.totalOutstandingBills}`,
      '',
      '=== CASH FLOW ===',
      'Metric,Amount',
      `Total Inflow,${cashFlow.totalInflow}`,
      `Total Outflow,${cashFlow.totalOutflow}`,
      `Net Cash,${cashFlow.netCash}`,
      '',
      '=== PAYMENT METHODS ===',
      'Method,Amount',
      `Cash,${paymentBreakdown.cash}`,
      `Card,${paymentBreakdown.card}`,
      `Mobile Money,${paymentBreakdown.mobile_money}`,
      `Credit/Pay Later,${paymentBreakdown.credit}`,
      '',
      '=== EXPENSE BREAKDOWN ===',
      'Category,Amount',
      ...expenseBreakdown.map(e => `${e.category},${e.amount}`),
      '',
      '=== DAILY SALES ===',
      'Date,Orders,Revenue,Discount,Net',
      ...dailySales.map(d => `${d.date},${d.orders},${d.revenue},${d.discount},${d.net}`),
      '',
      '=== EXPENSES LOG ===',
      'Date,Category,Description,Amount',
      ...expenseRows.map(e => `${e.date},${e.category},"${e.description}",${e.amount}`),
      '',
      '=== TOP PRODUCTS ===',
      'Product,Qty Sold,Revenue',
      ...topProducts.map(p => `"${p.name}",${p.qty},${p.revenue}`),
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-statement-${archiveData.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded!');
  };

  const printArchivePDF = () => {
    if (!archiveData) return toast.error('Load a statement first');
    window.print();
  };

  const fetchExtended = useCallback(async (tab) => {
    setExtLoading(true);
    const params = { from: dateRange.from, to: dateRange.to };
    try {
      if (tab === 'pl') {
        const res = await ExtendedReportsAPI.getProfitLoss(params);
        if (res.data?.data) setPlData(res.data.data);
      } else if (tab === 'cashflow') {
        const res = await ExtendedReportsAPI.getCashFlow(params);
        if (res.data?.data) setCashFlowData(res.data.data);
      } else if (tab === 'activity') {
        const res = await ExtendedReportsAPI.getActivityLog({ limit: 100 });
        if (res.data?.data) setActivityLogs(res.data.data);
      }
    } catch (err) { toast.error('Failed to load report data'); }
    finally { setExtLoading(false); }
  }, [dateRange]);

  const handleTabChange = (tab) => {
    if (isCashier && ['pl', 'cashflow', 'activity', 'receivables', 'payables', 'builder', 'scheduled'].includes(tab)) return;
    setActiveTab(tab);
    if (['pl', 'cashflow', 'activity'].includes(tab)) fetchExtended(tab);
  };



  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const activeBranchId = localStorage.getItem('active_branch_id');
      const params = { from: dateRange.from, to: dateRange.to, branchId: activeBranchId || undefined };
      const [sRes, iRes, pRes] = await Promise.allSettled([
        ReportsAPI.getSalesReport(params),
        ReportsAPI.getInventoryReport(params),
        ReportsAPI.getPurchaseReport(params),
      ]);

      if (sRes.status === 'fulfilled' && sRes.value.data?.success && sRes.value.data.data) {
        setSalesData(sRes.value.data.data);
      }
      if (iRes.status === 'fulfilled' && iRes.value.data?.success && iRes.value.data.data) {
        setInventoryData(iRes.value.data.data);
      }
      if (pRes.status === 'fulfilled' && pRes.value.data?.success && pRes.value.data.data) {
        setPurchaseData(pRes.value.data.data);
      }
    } catch (error) {
      console.log('Error fetching reports, using default report datasets');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchReports();
    const handleBranchChange = () => fetchReports();
    window.addEventListener('branchChanged', handleBranchChange);
    return () => window.removeEventListener('branchChanged', handleBranchChange);
  }, [fetchReports]);

  const exportCSV = (data, filename) => {
    if (!data || data.length === 0) return toast.error('No data to export');
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Track performance across sales, inventory and purchases</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {isCashier ? (
            <span style={{ color: '#64748B', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FiCalendar /> Today only ({today})
            </span>
          ) : (
            <>
              <input
                type="date"
                className="filter-input"
                value={dateRange.from}
                onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))}
              />
              <span style={{ color: '#64748B' }}>to</span>
              <input
                type="date"
                className="filter-input"
                value={dateRange.to}
                onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))}
              />
            </>
          )}
          <button className="btn btn-secondary" onClick={fetchReports} disabled={loading}>
            <FiRefreshCw style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Loading...' : isCashier ? 'Refresh' : 'Apply'}
          </button>
        </div>
      </div>

      <div className="tabs-container">
        <button className={`tab-btn ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => handleTabChange('sales')}>
          <FiTrendingUp style={{ marginRight: '6px' }} />Sales
        </button>
        <button className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => handleTabChange('inventory')}>
          <FiPackage style={{ marginRight: '6px' }} />Inventory
        </button>
        <button className={`tab-btn ${activeTab === 'purchases' ? 'active' : ''}`} onClick={() => handleTabChange('purchases')}>
          <FiShoppingCart style={{ marginRight: '6px' }} />Purchases
        </button>
        {!isCashier && (
          <>
            <button className={`tab-btn ${activeTab === 'pl' ? 'active' : ''}`} onClick={() => handleTabChange('pl')}>
              <FiDollarSign style={{ marginRight: '6px' }} />Profit & Loss
            </button>
            <button className={`tab-btn ${activeTab === 'cashflow' ? 'active' : ''}`} onClick={() => handleTabChange('cashflow')}>
              <FiArrowUp style={{ marginRight: '6px' }} />Cash Flow
            </button>
            <button className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => handleTabChange('activity')}>
              <FiActivity style={{ marginRight: '6px' }} />Activity Log
            </button>
            <button className={`tab-btn ${activeTab === 'receivables' ? 'active' : ''}`} onClick={() => handleTabChange('receivables')}>
              <FiArrowDown style={{ marginRight: '6px' }} />Receivables
            </button>
            <button className={`tab-btn ${activeTab === 'payables' ? 'active' : ''}`} onClick={() => handleTabChange('payables')}>
              <FiArrowUp style={{ marginRight: '6px' }} />Payables
            </button>
            <button className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`} onClick={() => handleTabChange('builder')}>
              <FiSliders style={{ marginRight: '6px' }} />Report Builder
            </button>
            <button className={`tab-btn ${activeTab === 'scheduled' ? 'active' : ''}`} onClick={() => handleTabChange('scheduled')}>
              <FiClock style={{ marginRight: '6px' }} />Scheduled
            </button>
          </>
        )}
        {user?.role === 'admin' && (
          <button
            className={`tab-btn ${activeTab === 'archive' ? 'tab-archive-active' : ''}`}
            onClick={() => handleTabChange('archive')}
          >
            <FiArchive style={{ marginRight: '6px' }} />Financial Archive
          </button>
        )}
      </div>

      <div className="tab-content">
        {/* ====== RECEIVABLES / PAYABLES / BUILDER / SCHEDULED ====== */}
        {activeTab === 'receivables' && !isCashier && <ReceivablesReport />}
        {activeTab === 'payables' && !isCashier && <PayablesReport />}
        {activeTab === 'builder' && !isCashier && <CustomReportBuilder />}
        {activeTab === 'scheduled' && !isCashier && <ScheduledReports />}

        {/* ====== SALES TAB ====== */}
        {activeTab === 'sales' && (
          <div className="report-section">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>Loading sales data...</div>
            ) : (
              <>
                <div className="summary-cards">
                  <div className="stat-card">
                    <h3>Total Revenue</h3>
                    <div className="stat-value">{formatCurrency(salesData?.totalRevenue)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Total Orders</h3>
                    <div className="stat-value">{salesData?.totalOrders || 0}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Avg Order Value</h3>
                    <div className="stat-value">{formatCurrency(salesData?.averageOrderValue)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Cash Sales</h3>
                    <div className="stat-value" style={{ color: '#16A34A' }}>{formatCurrency(salesData?.paymentBreakdown?.cash)}</div>
                  </div>
                </div>

                {/* Revenue Chart */}
                <div className="chart-card mt-6">
                  <h2 className="chart-title">Revenue Over Time</h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={salesData?.chartData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16A34A" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#16A34A" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 11 }} tickFormatter={formatDate} />
                      <YAxis stroke="#475569" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="sales" name="Sales" stroke="#16A34A" fill="url(#salesGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Payment Breakdown */}
                {salesData?.paymentBreakdown && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
                    <div className="chart-card">
                      <h2 className="chart-title">Payment Methods</h2>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Cash', value: salesData.paymentBreakdown.cash || 0 },
                              { name: 'Card', value: salesData.paymentBreakdown.card || 0 },
                              { name: 'Mobile', value: salesData.paymentBreakdown.mobile_money || 0 },
                            ]}
                            cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {COLORS.map((color, i) => <Cell key={i} fill={color} />)}
                          </Pie>
                          <Tooltip formatter={v => formatCurrency(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Daily Breakdown Table */}
                    <div className="chart-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h2 className="chart-title" style={{ margin: 0 }}>Daily Breakdown</h2>
                        <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(salesData?.dailyBreakdown || [], 'sales-report.csv')}>
                          <FiDownload /> Export CSV
                        </button>
                      </div>
                      <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        <table className="data-table" style={{ fontSize: '12px' }}>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Orders</th>
                              <th>Gross</th>
                              <th>Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(salesData?.dailyBreakdown || []).map((row, i) => (
                              <tr key={i}>
                                <td>{formatDate(row.date)}</td>
                                <td>{row.orders}</td>
                                <td>{formatCurrency(row.gross)}</td>
                                <td><strong style={{ color: '#16A34A' }}>{formatCurrency(row.net)}</strong></td>
                              </tr>
                            ))}
                            {(!salesData?.dailyBreakdown?.length) && (
                              <tr><td colSpan="4" style={{ textAlign: 'center', color: '#64748B' }}>No data</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ====== INVENTORY TAB ====== */}
        {activeTab === 'inventory' && (
          <div className="report-section">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>Loading inventory data...</div>
            ) : (
              <>
                <div className="summary-cards">
                  <div className="stat-card">
                    <h3>Total Products</h3>
                    <div className="stat-value">{inventoryData?.totalProducts || 0}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Low Stock Items</h3>
                    <div className="stat-value" style={{ color: '#D97706' }}>{inventoryData?.lowStockItems || 0}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Out of Stock</h3>
                    <div className="stat-value" style={{ color: '#DC2626' }}>{inventoryData?.outOfStockItems || 0}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Total Valuation</h3>
                    <div className="stat-value">{formatCurrency(inventoryData?.totalValuation)}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
                  {/* Category Distribution */}
                  <div className="chart-card">
                    <h2 className="chart-title">Stock by Category</h2>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={inventoryData?.categoryBreakdown || []} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                        <XAxis dataKey="category" stroke="#475569" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#475569" tick={{ fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Products" fill="#16A34A" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Low Stock Alert Table */}
                  <div className="chart-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h2 className="chart-title" style={{ margin: 0, color: '#DC2626' }}>⚠ Low Stock Alerts</h2>
                      <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(inventoryData?.lowStockList || [], 'low-stock.csv')}>
                        <FiDownload /> Export
                      </button>
                    </div>
                    <div style={{ maxHeight: '210px', overflowY: 'auto' }}>
                      <table className="data-table" style={{ fontSize: '12px' }}>
                        <thead>
                          <tr><th>Product</th><th>SKU</th><th>Qty</th><th>Reorder At</th></tr>
                        </thead>
                        <tbody>
                          {(inventoryData?.lowStockList || []).map((item, i) => (
                            <tr key={i}>
                              <td>{item.name}</td>
                              <td><code style={{ fontSize: '11px' }}>{item.sku}</code></td>
                              <td><span style={{ color: item.quantity === 0 ? '#DC2626' : '#D97706', fontWeight: 700 }}>{item.quantity}</span></td>
                              <td>{item.reorderLevel}</td>
                            </tr>
                          ))}
                          {(!inventoryData?.lowStockList?.length) && (
                            <tr><td colSpan="4" style={{ textAlign: 'center', color: '#16A34A' }}>✓ All products well stocked</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ====== PURCHASES TAB ====== */}
        {activeTab === 'purchases' && (
          <div className="report-section">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>Loading purchase data...</div>
            ) : (
              <>
                <div className="summary-cards">
                  <div className="stat-card">
                    <h3>Total Spend</h3>
                    <div className="stat-value">{formatCurrency(purchaseData?.totalSpend)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Outstanding Bills</h3>
                    <div className="stat-value" style={{ color: '#D97706' }}>{formatCurrency(purchaseData?.outstandingBills)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Total Orders</h3>
                    <div className="stat-value">{purchaseData?.totalOrders || 0}</div>
                  </div>
                  <div className="stat-card">
                    <h3>Total Vendors</h3>
                    <div className="stat-value">{purchaseData?.totalVendors || 0}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
                  {/* Order Status */}
                  <div className="chart-card">
                    <h2 className="chart-title">Order Status Breakdown</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Received', value: purchaseData?.receivedOrders || 0 },
                            { name: 'Pending', value: purchaseData?.pendingOrders || 0 },
                          ]}
                          cx="50%" cy="50%" outerRadius={80} dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          <Cell fill="#16A34A" />
                          <Cell fill="#D97706" />
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Top Vendors */}
                  <div className="chart-card">
                    <h2 className="chart-title">Top Vendors by Spend</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={purchaseData?.topVendors || []}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                        <XAxis type="number" stroke="#475569" tick={{ fontSize: 11 }} tickFormatter={v => formatCurrency(v)} />
                        <YAxis type="category" dataKey="name" stroke="#475569" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="totalSpend" name="Total Spend" fill="#2563EB" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ====== P&L TAB ====== */}
        {activeTab === 'pl' && (
          <div className="report-section">
            {extLoading ? <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>Loading P&L data...</div> : plData ? (
              <>
                <div className="summary-cards">
                  {[
                    { label: 'Revenue', val: plData.revenue, color: '#16A34A' },
                    { label: 'COGS', val: plData.cogs, color: '#64748B' },
                    { label: 'Gross Profit', val: plData.grossProfit, sub: `${plData.grossMargin}% margin`, color: '#2563EB' },
                    { label: 'Expenses', val: plData.totalExpenses, color: '#D97706' },
                    { label: 'Net Profit', val: plData.netProfit, sub: `${plData.netMargin}% margin`, color: plData.netProfit >= 0 ? '#16A34A' : '#DC2626' },
                  ].map(c => (
                    <div key={c.label} className="stat-card">
                      <h3>{c.label}</h3>
                      <div className="stat-value" style={{ color: c.color }}>{formatCurrency(c.val)}</div>
                      {c.sub && <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{c.sub}</div>}
                    </div>
                  ))}
                </div>

                {plData.chartData?.length > 0 && (
                  <div className="chart-card">
                    <h2 className="chart-title">Monthly P&L Breakdown</h2>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={plData.chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v, n) => [formatCurrency(v), n]} />
                        <Legend />
                        <Bar dataKey="revenue" name="Revenue" fill="#16A34A" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="cogs" name="COGS" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="grossProfit" name="Gross Profit" fill="#2563EB" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expenses" name="Expenses" fill="#D97706" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="netProfit" name="Net Profit" fill="#16A34A" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {plData.expenseBreakdown?.length > 0 && (
                  <div className="chart-card">
                    <h2 className="chart-title">Expense Breakdown by Category</h2>
                    <table className="data-table">
                      <thead><tr><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>% of Total</th></tr></thead>
                      <tbody>
                        {plData.expenseBreakdown.map(e => (
                          <tr key={e.category}>
                            <td><span className="badge badge-default">{e.category}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(e.amount)}</td>
                            <td style={{ textAlign: 'right', color: '#64748B' }}>{plData.totalExpenses > 0 ? Math.round(e.amount / plData.totalExpenses * 100) : 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>
                <p>No P&L data available for the selected period.</p>
                <p style={{ fontSize: '13px', marginTop: '8px' }}>Tip: Add expenses in the <a href="/expenses" style={{ color: '#16A34A' }}>Expenses</a> page and set product Cost Prices to see accurate P&L.</p>
              </div>
            )}
          </div>
        )}

        {/* ====== CASH FLOW TAB ====== */}
        {activeTab === 'cashflow' && (
          <div className="report-section">
            {extLoading ? <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>Loading cash flow data...</div> : cashFlowData ? (
              <>
                <div className="summary-cards">
                  <div className="stat-card"><h3>Total Inflow</h3><div className="stat-value" style={{ color: '#16A34A' }}>{formatCurrency(cashFlowData.totalInflow)}</div></div>
                  <div className="stat-card"><h3>Total Outflow</h3><div className="stat-value" style={{ color: '#DC2626' }}>{formatCurrency(cashFlowData.totalOutflow)}</div></div>
                  <div className="stat-card"><h3>Net Cash</h3><div className="stat-value" style={{ color: cashFlowData.netCash >= 0 ? '#16A34A' : '#DC2626' }}>{formatCurrency(cashFlowData.netCash)}</div></div>
                </div>
                {cashFlowData.daily?.length > 0 && (
                  <div className="chart-card">
                    <h2 className="chart-title">Daily Cash Flow</h2>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={cashFlowData.daily} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#16A34A" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="outflow" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v, n) => [formatCurrency(v), n]} />
                        <Legend />
                        <Area type="monotone" dataKey="inflow" name="Inflow" stroke="#16A34A" strokeWidth={2} fill="url(#inflow)" />
                        <Area type="monotone" dataKey="outflow" name="Outflow" stroke="#DC2626" strokeWidth={2} fill="url(#outflow)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>No cash flow data for selected period.</div>
            )}
          </div>
        )}

        {/* ====== ACTIVITY LOG TAB ====== */}
        {activeTab === 'activity' && (
          <div className="report-section">
            {extLoading ? <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>Loading activity log...</div> : (
              <div className="chart-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 className="chart-title" style={{ margin: 0 }}>User Activity Log</h2>
                  <button className="btn btn-outline btn-sm" onClick={() => exportCSV(activityLogs.map(l => ({ Date: new Date(l.createdAt).toLocaleString(), User: l.userId?.name || '-', Email: l.userId?.email || '-', Role: l.userId?.role || '-', Action: l.action, Details: l.details || '' })), 'activity-log.csv')}>
                    <FiDownload /> Export CSV
                  </button>
                </div>
                <table className="data-table">
                  <thead><tr><th>Date / Time</th><th>User</th><th>Role</th><th>Action</th></tr></thead>
                  <tbody>
                    {activityLogs.length > 0 ? activityLogs.map((log, i) => (
                      <tr key={log._id || i}>
                        <td style={{ color: '#64748B', fontSize: '13px' }}>{new Date(log.createdAt).toLocaleString()}</td>
                        <td><strong>{log.userId?.name || '-'}</strong><div style={{ fontSize: '11px', color: '#94A3B8' }}>{log.userId?.email}</div></td>
                        <td><span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{log.userId?.role || '-'}</span></td>
                        <td>{log.action}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="4" style={{ textAlign: 'center', color: '#64748B', padding: '32px' }}>No activity logs found for this tenant.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

        {/* ====== FINANCIAL ARCHIVE TAB ====== */}
        {activeTab === 'archive' && user?.role === 'admin' && (
          <div className="report-section">
          {/* ── Period Selector ── */}
          <div style={{ background: 'linear-gradient(135deg,#052e16,#14532d)', borderRadius: '16px', padding: '28px 32px', marginBottom: '24px', border: '1px solid #166534', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <FiArchive style={{ color: '#4ADE80', fontSize: '22px' }} />
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, margin: 0 }}>Financial Statements Archive</h2>
              </div>
              <p style={{ color: '#ffffffff', fontSize: '13px', margin: 0 }}>Download complete financial statements for any month or full year — Income Statement, Cash Flow, Expenses & more.</p>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {/* Period type toggle */}
              <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #166534' }}>
                {['month', 'year'].map(t => (
                  <button key={t} onClick={() => setArchivePeriodType(t)}
                    style={{ padding: '8px 18px', background: archivePeriodType === t ? '#16A34A' : '#052e16', color: archivePeriodType === t ? '#fff' : '#86EFAC', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', textTransform: 'capitalize' }}>
                    {t === 'month' ? '📅 Monthly' : '📆 Annual'}
                  </button>
                ))}
              </div>

              {archivePeriodType === 'month' ? (
                <div>
                  <label style={{ color: '#86EFAC', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Select Month</label>
                  <input type="month" value={archiveMonth} onChange={e => setArchiveMonth(e.target.value)}
                    style={{ background: '#052e16', border: '1px solid #166534', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '14px' }} />
                </div>
              ) : (
                <div>
                  <label style={{ color: '#86EFAC', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Select Year</label>
                  <select value={archiveYear} onChange={e => setArchiveYear(e.target.value)}
                    style={{ background: '#052e16', border: '1px solid #166534', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '14px' }}>
                    {Array.from({ length: 6 }, (_, i) => currentYear - i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}

              <button onClick={fetchArchive} disabled={archiveLoading}
                style={{ padding: '9px 22px', background: '#16A34A', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: archiveLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: archiveLoading ? 0.7 : 1 }}>
                <FiCalendar />{archiveLoading ? 'Loading...' : 'Generate Statement'}
              </button>
            </div>
          </div>

          {/* ── Results ── */}
          {archiveLoading && (
            <div style={{ textAlign: 'center', padding: '60px', color: '#4ADE80' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
              <p>Compiling financial statement...</p>
            </div>
          )}

          {!archiveLoading && archiveData && (
            <div id="archive-print-area">
              {/* Header Banner */}
              <div style={{ background: '#0f172a', border: '1px solid #1E293B', borderRadius: '12px', padding: '20px 28px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#4ADE80', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Financial Statement</div>
                  <div style={{ color: '#fff', fontSize: '22px', fontWeight: 800, marginTop: '4px' }}>
                    {archiveData.periodType === 'year' ? `Annual Report — ${archiveData.period}` : `Monthly Report — ${new Date(archiveData.period + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}
                  </div>
                  <div style={{ color: '#64748B', fontSize: '12px', marginTop: '4px' }}>Generated: {new Date(archiveData.generatedAt).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={exportArchiveCSV}
                    style={{ padding: '10px 20px', background: '#16A34A', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <FiDownload /> Download CSV
                  </button>
                  <button onClick={printArchivePDF}
                    style={{ padding: '10px 20px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <FiPrinter /> Print / PDF
                  </button>
                </div>
              </div>

              {/* Income Statement */}
              <div className="chart-card" style={{ marginBottom: '20px' }}>
                <h2 className="chart-title" style={{ borderBottom: '1px solid #1E293B', paddingBottom: '12px', marginBottom: '16px' }}>📋 Income Statement</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '16px' }}>
                  {[
                    { label: 'Total Revenue', val: archiveData.summary.totalRevenue, color: '#16A34A', icon: '💰' },
                    { label: 'Cost of Goods Sold', val: archiveData.summary.cogs, color: '#64748B', icon: '📦' },
                    { label: 'Gross Profit', val: archiveData.summary.grossProfit, color: '#2563EB', sub: `${archiveData.summary.grossMargin}% margin`, icon: '📈' },
                    { label: 'Total Expenses', val: archiveData.summary.totalExpenses, color: '#D97706', icon: '📤' },
                    { label: 'Net Profit', val: archiveData.summary.netProfit, color: archiveData.summary.netProfit >= 0 ? '#16A34A' : '#DC2626', sub: `${archiveData.summary.netMargin}% margin`, icon: '🏦' },
                    { label: 'Total Orders', val: archiveData.summary.totalOrders, color: '#16A34A', isNum: true, icon: '🧾' },
                  ].map(c => (
                    <div key={c.label} style={{ background: '#0f172a', border: '1px solid #1E293B', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', marginBottom: '6px' }}>{c.icon}</div>
                      <div style={{ color: '#64748B', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</div>
                      <div style={{ color: c.color, fontWeight: 800, fontSize: '18px', marginTop: '6px' }}>
                        {c.isNum ? c.val : formatCurrency(c.val)}
                      </div>
                      {c.sub && <div style={{ color: '#475569', fontSize: '11px', marginTop: '3px' }}>{c.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cash Flow + Payment Side by Side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div className="chart-card">
                  <h2 className="chart-title" style={{ marginBottom: '16px' }}>💸 Cash Flow</h2>
                  {[
                    { label: 'Total Inflow', val: archiveData.cashFlow.totalInflow, color: '#16A34A' },
                    { label: 'Total Outflow', val: archiveData.cashFlow.totalOutflow, color: '#DC2626' },
                    { label: 'Net Cash', val: archiveData.cashFlow.netCash, color: archiveData.cashFlow.netCash >= 0 ? '#16A34A' : '#DC2626', bold: true },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1E293B' }}>
                      <span style={{ color: '#94A3B8' }}>{r.label}</span>
                      <span style={{ color: r.color, fontWeight: r.bold ? 800 : 600, fontSize: r.bold ? '16px' : '14px' }}>{formatCurrency(r.val)}</span>
                    </div>
                  ))}
                </div>

                <div className="chart-card">
                  <h2 className="chart-title" style={{ marginBottom: '16px' }}>💳 Payment Methods</h2>
                  {[
                    { label: 'Cash', val: archiveData.paymentBreakdown.cash, color: '#16A34A' },
                    { label: 'Card', val: archiveData.paymentBreakdown.card, color: '#2563EB' },
                    { label: 'Mobile Money', val: archiveData.paymentBreakdown.mobile_money, color: '#D97706' },
                    { label: 'Credit/Pay Later', val: archiveData.paymentBreakdown.credit, color: '#7C3AED' },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1E293B' }}>
                      <span style={{ color: '#94A3B8' }}>{r.label}</span>
                      <span style={{ color: r.color, fontWeight: 600 }}>{formatCurrency(r.val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expense Breakdown */}
              {archiveData.expenseBreakdown?.length > 0 && (
                <div className="chart-card" style={{ marginBottom: '20px' }}>
                  <h2 className="chart-title" style={{ marginBottom: '16px' }}>📊 Expense Breakdown by Category</h2>
                  <table className="data-table">
                    <thead><tr><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>% of Total Expenses</th></tr></thead>
                    <tbody>
                      {archiveData.expenseBreakdown.map(e => (
                        <tr key={e.category}>
                          <td><span className="badge badge-default">{e.category}</span></td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(e.amount)}</td>
                          <td style={{ textAlign: 'right', color: '#64748B' }}>
                            {archiveData.summary.totalExpenses > 0 ? Math.round(e.amount / archiveData.summary.totalExpenses * 100) : 0}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Daily Sales */}
              {archiveData.dailySales?.length > 0 && (
                <div className="chart-card" style={{ marginBottom: '20px' }}>
                  <h2 className="chart-title" style={{ marginBottom: '16px' }}>📅 Daily Sales Summary</h2>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '12px' }}>
                      <thead><tr><th>Date</th><th>Orders</th><th>Revenue</th><th>Discount</th><th>Net Revenue</th></tr></thead>
                      <tbody>
                        {archiveData.dailySales.map((d, i) => (
                          <tr key={i}>
                            <td style={{ color: '#94A3B8' }}>{d.date}</td>
                            <td>{d.orders}</td>
                            <td>{formatCurrency(d.revenue)}</td>
                            <td style={{ color: '#D97706' }}>{formatCurrency(d.discount)}</td>
                            <td><strong style={{ color: '#16A34A' }}>{formatCurrency(d.net)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#0f172a', fontWeight: 800 }}>
                          <td colSpan={1}><strong>TOTAL</strong></td>
                          <td><strong>{archiveData.dailySales.reduce((s, d) => s + d.orders, 0)}</strong></td>
                          <td><strong style={{ color: '#16A34A' }}>{formatCurrency(archiveData.dailySales.reduce((s, d) => s + d.revenue, 0))}</strong></td>
                          <td><strong style={{ color: '#D97706' }}>{formatCurrency(archiveData.dailySales.reduce((s, d) => s + d.discount, 0))}</strong></td>
                          <td><strong style={{ color: '#16A34A' }}>{formatCurrency(archiveData.dailySales.reduce((s, d) => s + d.net, 0))}</strong></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Top Products */}
              {archiveData.topProducts?.length > 0 && (
                <div className="chart-card">
                  <h2 className="chart-title" style={{ marginBottom: '16px' }}>🏆 Top Products</h2>
                  <table className="data-table" style={{ fontSize: '13px' }}>
                    <thead><tr><th>#</th><th>Product</th><th style={{ textAlign: 'right' }}>Qty Sold</th><th style={{ textAlign: 'right' }}>Revenue</th></tr></thead>
                    <tbody>
                      {archiveData.topProducts.map((p, i) => (
                        <tr key={i}>
                          <td style={{ color: '#64748B', fontWeight: 700 }}>#{i + 1}</td>
                          <td>{p.name}</td>
                          <td style={{ textAlign: 'right' }}>{p.qty}</td>
                          <td style={{ textAlign: 'right', color: '#16A34A', fontWeight: 700 }}>{formatCurrency(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!archiveLoading && !archiveData && (
            <div style={{ textAlign: 'center', padding: '80px 40px', color: '#64748B' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>📁</div>
              <h3 style={{ color: '#94A3B8', marginBottom: '8px' }}>No Statement Generated Yet</h3>
              <p style={{ fontSize: '14px' }}>Select a period above and click <strong style={{ color: '#16A34A' }}>Generate Statement</strong> to create and download your financial report.</p>
            </div>
          )}
          </div>
        )}

    </div>
  );
};

export default Reports;
