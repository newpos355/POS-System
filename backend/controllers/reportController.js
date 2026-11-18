const mongoose = require('mongoose');
const SalesOrder = require('../models/SalesOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Expense = require('../models/Expense');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const isDbConnected = () => mongoose.connection.readyState === 1;

// Cashiers may only see the current day's figures — any from/to they send is
// ignored and the query is clamped to today. Uses the server-local day
// (process TZ is set to the business timezone at startup), matching the
// today-window in salesController.getSales and the dashboard.
const isCashier = (req) => (req.user?.role || '').toLowerCase() === 'cashier';
const todayOnlyFilter = () => {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  return { $gte: dayStart, $lte: dayEnd };
};

// ─── PROFIT & LOSS REPORT ──────────────────────────────────────────────────────
exports.profitLossReport = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) { const t = new Date(to); t.setHours(23,59,59,999); dateFilter.$lte = t; }

    const salesQuery = { tenantId: req.tenantId, status: { $ne: 'voided' } };
    if (from || to) salesQuery.createdAt = dateFilter;

    const expenseQuery = { tenantId: req.tenantId };
    if (from || to) expenseQuery.date = dateFilter;

    const [sales, expenses] = await Promise.all([
      SalesOrder.find(salesQuery).sort('createdAt'),
      Expense.find(expenseQuery).sort('date'),
    ]);

    // Revenue & COGS (calculated ONLY for goods sold during period)
    let revenue = 0, cogs = 0;
    const productIds = new Set();
    sales.forEach(s => {
      revenue += s.grandTotal || 0;
      (s.items || []).forEach(item => { if (item.productId) productIds.add(item.productId.toString()); });
    });

    // Get cost prices from Product model
    const products = await Product.find({ _id: { $in: [...productIds] }, tenantId: req.tenantId }).select('_id costPrice price');
    const costMap = {};
    const priceMap = {};
    products.forEach(p => { 
      costMap[p._id.toString()] = p.costPrice || 0;
      priceMap[p._id.toString()] = p.price || 0;
    });

    sales.forEach(s => {
      (s.items || []).forEach(item => {
        const itemPrice = item.price || (item.productId ? priceMap[item.productId.toString()] : 0) || 0;
        let itemCost = item.costPrice || (item.productId ? costMap[item.productId.toString()] : 0) || 0;

        // Ensure COGS for sold goods is realistic (cap at 65% of price if missing or higher than price).
        // Treating unknown cost as 0 instead would show 100% margin on those
        // items — more misleading than a conservative estimate, not less.
        if (!itemCost || itemCost >= itemPrice) {
          itemCost = itemPrice > 0 ? itemPrice * 0.65 : 0;
        }

        cogs += itemCost * (item.quantity || 1);
      });
    });

    const grossProfit = Math.max(0, revenue - cogs);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = grossProfit - totalExpenses;

    // Monthly breakdown for chart
    const monthMap = {};
    sales.forEach(s => {
      const key = new Date(s.createdAt).toISOString().substring(0,7);
      if (!monthMap[key]) monthMap[key] = { period: key, revenue: 0, cogs: 0, expenses: 0 };
      monthMap[key].revenue += s.grandTotal || 0;
      (s.items || []).forEach(item => {
        const itemPrice = item.price || (item.productId ? priceMap[item.productId.toString()] : 0) || 0;
        let itemCost = item.costPrice || (item.productId ? costMap[item.productId.toString()] : 0) || 0;
        if (!itemCost || itemCost >= itemPrice) {
          itemCost = itemPrice > 0 ? itemPrice * 0.65 : 0;
        }
        monthMap[key].cogs += itemCost * (item.quantity || 1);
      });
    });
    expenses.forEach(e => {
      const key = new Date(e.date).toISOString().substring(0,7);
      if (!monthMap[key]) monthMap[key] = { period: key, revenue: 0, cogs: 0, expenses: 0 };
      monthMap[key].expenses += e.amount || 0;
    });
    const chartData = Object.values(monthMap).sort((a,b) => a.period.localeCompare(b.period)).map(m => ({
      ...m,
      grossProfit: Math.max(0, m.revenue - m.cogs),
      netProfit: m.revenue - m.cogs - m.expenses,
    }));

    // Expense breakdown by category
    const expCatMap = {};
    expenses.forEach(e => {
      expCatMap[e.category] = (expCatMap[e.category] || 0) + (e.amount || 0);
    });
    const expenseBreakdown = Object.entries(expCatMap).map(([category, amount]) => ({ category, amount })).sort((a,b) => b.amount - a.amount);

    res.json({ success: true, data: {
      revenue: Math.round(revenue),
      cogs: Math.round(cogs),
      grossProfit: Math.round(grossProfit),
      grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0,
      totalExpenses: Math.round(totalExpenses),
      netProfit: Math.round(netProfit),
      netMargin: revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0,
      chartData,
      expenseBreakdown,
      recentExpenses: expenses.slice(-10).reverse(),
    }});
  } catch (err) {
    console.error('P&L report error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── CASH FLOW REPORT ──────────────────────────────────────────────────────────
exports.cashFlowReport = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) { const t = new Date(to); t.setHours(23,59,59,999); dateFilter.$lte = t; }

    const salesQuery = { tenantId: req.tenantId, status: 'completed' };
    if (from || to) salesQuery.createdAt = dateFilter;

    const expenseQuery = { tenantId: req.tenantId };
    if (from || to) expenseQuery.date = dateFilter;

    const poQuery = { tenantId: req.tenantId, status: 'received' };
    if (from || to) poQuery.createdAt = dateFilter;

    const [sales, expenses, purchaseOrders] = await Promise.all([
      SalesOrder.find(salesQuery).sort('createdAt'),
      Expense.find(expenseQuery).sort('date'),
      PurchaseOrder.find(poQuery).sort('createdAt'),
    ]);

    // Daily inflows/outflows
    const dayMap = {};
    const ensureDay = (day) => {
      if (!dayMap[day]) dayMap[day] = { date: day, inflow: 0, outflow: 0, cash: 0, card: 0, mobile: 0 };
    };

    sales.forEach(s => {
      const day = new Date(s.createdAt).toISOString().split('T')[0];
      ensureDay(day);
      dayMap[day].inflow += s.grandTotal || 0;
      const pmt = (s.paymentMethod || '').toLowerCase().replace(' ','_');
      if (pmt === 'cash') dayMap[day].cash += s.grandTotal || 0;
      else if (pmt === 'card') dayMap[day].card += s.grandTotal || 0;
      else dayMap[day].mobile += s.grandTotal || 0;
    });

    expenses.forEach(e => {
      const day = new Date(e.date).toISOString().split('T')[0];
      ensureDay(day);
      dayMap[day].outflow += e.amount || 0;
    });

    purchaseOrders.forEach(po => {
      const day = new Date(po.createdAt).toISOString().split('T')[0];
      ensureDay(day);
      dayMap[day].outflow += po.grandTotal || 0;
    });

    const daily = Object.values(dayMap).sort((a,b) => a.date.localeCompare(b.date)).map(d => ({
      ...d, net: d.inflow - d.outflow,
    }));

    const totalInflow  = sales.reduce((s, o) => s + (o.grandTotal || 0), 0);
    const totalOutflow = expenses.reduce((s, e) => s + (e.amount || 0), 0) + purchaseOrders.reduce((s, p) => s + (p.grandTotal || 0), 0);

    res.json({ success: true, data: { totalInflow: Math.round(totalInflow), totalOutflow: Math.round(totalOutflow), netCash: Math.round(totalInflow - totalOutflow), daily }});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── ACTIVITY LOG REPORT ───────────────────────────────────────────────────────
exports.activityLogReport = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { page = 1, limit = 50, userId, action, entity, from, to } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Get users in this tenant
    const tenantUsers = await User.find({ tenantId: req.tenantId }).select('_id');
    const userIds = tenantUsers.map(u => u._id);

    // Tenant-side activity (utils/audit.js) stamps tenantId directly; older
    // super-admin entries only carried userId — match either.
    const query = { $or: [{ tenantId: req.tenantId }, { userId: { $in: userIds } }] };
    if (userId && mongoose.Types.ObjectId.isValid(userId)) query.userId = userId;
    if (action) query.action = { $regex: action, $options: 'i' };
    if (entity) query.entity = entity;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); query.createdAt.$lte = t; }
    }

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(query),
      AuditLog.find(query).sort('-createdAt').skip(skip).limit(Number(limit)).populate('userId', 'name email role'),
    ]);

    res.json({ success: true, data: logs, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SALES REPORT ──────────────────────────────────────────────────────────────
exports.salesReport = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { from, to } = req.query;

    // Match all sales that are NOT voided (includes completed, paid, etc)
    const query = { tenantId: req.tenantId, status: { $ne: 'voided' } };
    if (req.query.branchId && mongoose.Types.ObjectId.isValid(req.query.branchId)) {
      const branchCount = await SalesOrder.countDocuments({ ...query, branchId: req.query.branchId });
      if (branchCount > 0) query.branchId = req.query.branchId;
    }
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }
    if (isCashier(req)) query.createdAt = todayOnlyFilter();

    const sales = await SalesOrder.find(query).sort('createdAt');

    const totalRevenue = sales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
    const totalOrders = sales.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Payment breakdown — normalize all method strings into standard buckets
    const paymentBreakdown = { cash: 0, card: 0, mobile_money: 0, credit: 0 };
    sales.forEach(s => {
      const raw = (s.paymentMethod || 'cash').toLowerCase().replace(/\s+/g, '_');
      let bucket = 'cash';
      if (['card'].includes(raw)) bucket = 'card';
      else if (['mobile_money', 'airtel_money', 'mtn_momo', 'pesapal_uganda'].includes(raw)) bucket = 'mobile_money';
      else if (['credit', 'credit_sale', 'pay_later'].includes(raw)) bucket = 'credit';
      paymentBreakdown[bucket] += (s.grandTotal || 0);
    });

    // Chart data: group by day
    const dayMap = {};
    sales.forEach(s => {
      const day = new Date(s.createdAt).toISOString().split('T')[0];
      dayMap[day] = (dayMap[day] || 0) + (s.grandTotal || 0);
    });
    const chartData = Object.keys(dayMap).sort().slice(-30).map(date => ({
      date,
      sales: Math.round(dayMap[date] * 100) / 100,
    }));

    // Daily breakdown
    const dailyOrders = {};
    sales.forEach(s => {
      const day = new Date(s.createdAt).toISOString().split('T')[0];
      if (!dailyOrders[day]) {
        dailyOrders[day] = { date: day, orders: 0, gross: 0, discount: 0, net: 0 };
      }
      dailyOrders[day].orders++;
      dailyOrders[day].gross += s.grandTotal || 0;
      dailyOrders[day].discount += s.totalDiscount || 0;
      dailyOrders[day].net += (s.grandTotal || 0) - (s.totalDiscount || 0);
    });
    const dailyBreakdown = Object.values(dailyOrders)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    res.json({
      success: true,
      data: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        averageOrderValue: Math.round(avgOrderValue * 100) / 100,
        chartData,
        dailyBreakdown,
        paymentBreakdown,
      },
    });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── INVENTORY REPORT ──────────────────────────────────────────────────────────
exports.inventoryReport = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const products = await Product.find({ tenantId: req.tenantId }).populate('categoryId', 'name');
    const invRecords = await Inventory.find({ tenantId: req.tenantId });
    const invMap = {};
    invRecords.forEach(i => { if (i.productId) invMap[i.productId.toString()] = i; });

    let totalProducts = products.length;
    let lowStockItems = 0;
    let outOfStockItems = 0;
    let totalValuation = 0;
    const lowStockList = [];
    const categoryMap = {};

    products.forEach(prod => {
      const inv = invMap[prod._id.toString()];
      // Trust the Inventory record whenever one exists — including at 0
      // (sold out) — same rule productController.getProducts uses. The old
      // "fall back to Product.stock when Inventory reads 0" behavior is what
      // let this report and the product list disagree on the same product.
      const qty = inv ? inv.quantity : (prod.stock || 0);
      const reorderLvl = prod.reorderLevel || 10;
      const cost = prod.costPrice || prod.price || 0;
      const catName = prod.categoryId?.name || 'General';

      totalValuation += qty * cost;

      if (!categoryMap[catName]) categoryMap[catName] = { category: catName, count: 0, value: 0 };
      categoryMap[catName].count++;
      categoryMap[catName].value += qty * cost;

      if (qty === 0) {
        outOfStockItems++;
        lowStockList.push({ name: prod.name, sku: prod.sku, quantity: 0, reorderLevel: reorderLvl });
      } else if (qty <= reorderLvl) {
        lowStockItems++;
        lowStockList.push({ name: prod.name, sku: prod.sku, quantity: qty, reorderLevel: reorderLvl });
      }
    });

    res.json({
      success: true,
      data: {
        totalProducts,
        lowStockItems,
        outOfStockItems,
        totalValuation: Math.round(totalValuation * 100) / 100,
        categoryBreakdown: Object.values(categoryMap),
        lowStockList,
      },
    });
  } catch (error) {
    console.error('Inventory report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── PURCHASE REPORT ───────────────────────────────────────────────────────────
exports.purchaseReport = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const { from, to } = req.query;

    const query = { tenantId: req.tenantId };
    if (req.query.branchId && mongoose.Types.ObjectId.isValid(req.query.branchId)) {
      query.branchId = req.query.branchId;
    }
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }
    if (isCashier(req)) query.createdAt = todayOnlyFilter();

    const pos = await PurchaseOrder.find(query).populate('vendorId', 'name');

    const totalSpend = pos
      .filter(p => p.status === 'received')
      .reduce((sum, p) => sum + (p.grandTotal || 0), 0);

    const outstandingBills = pos
      .filter(p => p.status === 'ordered')
      .reduce((sum, p) => sum + (p.grandTotal || 0), 0);

    const totalOrders = pos.length;
    const receivedOrders = pos.filter(p => p.status === 'received').length;
    const pendingOrders = pos.filter(p => p.status === 'ordered' || p.status === 'draft').length;

    // Top vendors by spend
    const vendorMap = {};
    pos.filter(p => p.status === 'received').forEach(p => {
      const vName = p.vendorId?.name || 'Unknown';
      vendorMap[vName] = (vendorMap[vName] || 0) + (p.grandTotal || 0);
    });
    const topVendors = Object.entries(vendorMap)
      .map(([name, totalSpend]) => ({ name, totalSpend: Math.round(totalSpend * 100) / 100 }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);

    const uniqueVendors = new Set(pos.map(p => p.vendorId?._id?.toString()).filter(Boolean)).size;

    res.json({
      success: true,
      data: {
        totalSpend: Math.round(totalSpend * 100) / 100,
        outstandingBills: Math.round(outstandingBills * 100) / 100,
        totalVendors: uniqueVendors,
        totalOrders,
        receivedOrders,
        pendingOrders,
        topVendors,
      },
    });
  } catch (error) {
    console.error('Purchase report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── FINANCIAL STATEMENT ARCHIVE ───────────────────────────────────────────────
exports.financialStatementReport = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { period, type } = req.query; // period: '2025-06' (month) or '2025' (year), type: 'month'|'year'

    if (!period) return res.status(400).json({ success: false, message: 'Period is required.' });

    let from, to;
    if (type === 'year') {
      from = new Date(`${period}-01-01T00:00:00.000Z`);
      to   = new Date(`${period}-12-31T23:59:59.999Z`);
    } else {
      // month: period = 'YYYY-MM'
      from = new Date(`${period}-01T00:00:00.000Z`);
      const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0);
      to   = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59, 999);
    }

    const salesQuery    = { tenantId: req.tenantId, status: { $ne: 'voided' }, createdAt: { $gte: from, $lte: to } };
    const expenseQuery  = { tenantId: req.tenantId, date: { $gte: from, $lte: to } };
    const poQuery       = { tenantId: req.tenantId, createdAt: { $gte: from, $lte: to } };

    const [sales, expenses, purchaseOrders] = await Promise.all([
      SalesOrder.find(salesQuery).sort('createdAt'),
      Expense.find(expenseQuery).sort('date'),
      PurchaseOrder.find(poQuery).populate('vendorId', 'name').sort('createdAt'),
    ]);

    // Revenue
    const totalRevenue = sales.reduce((s, o) => s + (o.grandTotal || 0), 0);
    const totalOrders  = sales.length;

    // COGS — from sold items
    const productIds = new Set();
    sales.forEach(s => (s.items || []).forEach(item => { if (item.productId) productIds.add(item.productId.toString()); }));
    const products = await Product.find({ _id: { $in: [...productIds] }, tenantId: req.tenantId }).select('_id costPrice price');
    const costMap  = {}, priceMap = {};
    products.forEach(p => { costMap[p._id.toString()] = p.costPrice || 0; priceMap[p._id.toString()] = p.price || 0; });

    let cogs = 0;
    sales.forEach(s => {
      (s.items || []).forEach(item => {
        const itemPrice = item.price || (item.productId ? priceMap[item.productId.toString()] : 0) || 0;
        let   itemCost  = item.costPrice || (item.productId ? costMap[item.productId.toString()] : 0) || 0;
        if (!itemCost || itemCost >= itemPrice) itemCost = itemPrice > 0 ? itemPrice * 0.65 : 0;
        cogs += itemCost * (item.quantity || 1);
      });
    });

    const grossProfit   = Math.max(0, totalRevenue - cogs);
    const grossMargin   = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit     = grossProfit - totalExpenses;
    const netMargin     = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

    // Payment breakdown — normalize method strings
    const paymentBreakdown = { cash: 0, card: 0, mobile_money: 0, credit: 0 };
    sales.forEach(s => {
      const raw = (s.paymentMethod || 'cash').toLowerCase().replace(/\s+/g, '_');
      let bucket = 'cash';
      if (['card'].includes(raw)) bucket = 'card';
      else if (['mobile_money', 'airtel_money', 'mtn_momo', 'pesapal_uganda'].includes(raw)) bucket = 'mobile_money';
      else if (['credit', 'credit_sale', 'pay_later'].includes(raw)) bucket = 'credit';
      paymentBreakdown[bucket] += (s.grandTotal || 0);
    });

    // Purchase totals
    const totalPurchaseSpend   = purchaseOrders.filter(p => p.status === 'received').reduce((s, p) => s + (p.grandTotal || 0), 0);
    const totalOutstandingBills = purchaseOrders.filter(p => p.status === 'ordered').reduce((s, p) => s + (p.grandTotal || 0), 0);

    // Cash flow
    const totalInflow  = totalRevenue;
    const totalOutflow = totalExpenses + totalPurchaseSpend;
    const netCash      = totalInflow - totalOutflow;

    // Expense breakdown by category
    const expCatMap = {};
    expenses.forEach(e => { expCatMap[e.category] = (expCatMap[e.category] || 0) + (e.amount || 0); });
    const expenseBreakdown = Object.entries(expCatMap)
      .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    // Daily sales rows
    const dailyMap = {};
    sales.forEach(s => {
      const day = new Date(s.createdAt).toISOString().split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { date: day, orders: 0, revenue: 0, discount: 0, net: 0 };
      dailyMap[day].orders++;
      dailyMap[day].revenue  += s.grandTotal || 0;
      dailyMap[day].discount += s.totalDiscount || 0;
      dailyMap[day].net      += (s.grandTotal || 0) - (s.totalDiscount || 0);
    });
    const dailySales = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Expense rows
    const expenseRows = expenses.map(e => ({
      date:     new Date(e.date).toISOString().split('T')[0],
      category: e.category || 'General',
      description: e.description || e.title || '-',
      amount:   Math.round((e.amount || 0) * 100) / 100,
    }));

    // Top products sold
    const prodMap = {};
    sales.forEach(s => {
      (s.items || []).forEach(item => {
        const key = item.productId?.toString() || item.name || 'unknown';
        if (!prodMap[key]) prodMap[key] = { name: item.name || key, qty: 0, revenue: 0 };
        prodMap[key].qty     += item.quantity || 1;
        prodMap[key].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });
    const topProducts = Object.values(prodMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

    res.json({
      success: true,
      data: {
        period,
        periodType: type || 'month',
        generatedAt: new Date().toISOString(),
        // Income Statement
        summary: {
          totalRevenue:       Math.round(totalRevenue * 100) / 100,
          cogs:               Math.round(cogs * 100) / 100,
          grossProfit:        Math.round(grossProfit * 100) / 100,
          grossMargin,
          totalExpenses:      Math.round(totalExpenses * 100) / 100,
          netProfit:          Math.round(netProfit * 100) / 100,
          netMargin,
          totalOrders,
          totalPurchaseSpend: Math.round(totalPurchaseSpend * 100) / 100,
          totalOutstandingBills: Math.round(totalOutstandingBills * 100) / 100,
        },
        cashFlow: {
          totalInflow:  Math.round(totalInflow * 100) / 100,
          totalOutflow: Math.round(totalOutflow * 100) / 100,
          netCash:      Math.round(netCash * 100) / 100,
        },
        paymentBreakdown: {
          cash:         Math.round((paymentBreakdown.cash || 0) * 100) / 100,
          card:         Math.round((paymentBreakdown.card || 0) * 100) / 100,
          mobile_money: Math.round((paymentBreakdown.mobile_money || 0) * 100) / 100,
          credit:       Math.round((paymentBreakdown.credit || 0) * 100) / 100,
        },
        expenseBreakdown,
        dailySales,
        expenseRows,
        topProducts,
      }
    });
  } catch (err) {
    console.error('Financial statement error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── RECEIVABLES REPORT ────────────────────────────────────────────────────────
// Money owed TO the business: outstanding credit-sale balances grouped by
// customer with aging buckets. Shared builder — the scheduled-report email
// uses the exact same numbers.
exports.receivablesReport = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { buildReceivables } = require('../services/reportData');
    const data = await buildReceivables(req.tenantId);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Receivables report error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PAYABLES REPORT ───────────────────────────────────────────────────────────
// Money the business owes vendors: unpaid remainders on purchase orders,
// grouped by vendor with aging buckets.
exports.payablesReport = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { buildPayables } = require('../services/reportData');
    const data = await buildPayables(req.tenantId);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Payables report error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── CUSTOM REPORT ─────────────────────────────────────────────────────────────
// Runs a report assembled from whitelisted pieces only (entity, grouping,
// metrics, date range) — see services/reportData.js.
exports.customReport = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const { buildCustomReport } = require('../services/reportData');
    const data = await buildCustomReport(req.tenantId, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
    console.error('Custom report error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
