const mongoose = require('mongoose');
const SalesOrder = require('../models/SalesOrder');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Customer = require('../models/Customer');

const isDbConnected = () => mongoose.connection.readyState === 1;

exports.getDashboard = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    // Cashiers / branch managers are locked to today's window — any period
    // they send is ignored (same rule as getSales in salesController).
    const roleLockedToToday = ['cashier', 'branch_manager']
      .includes((req.user?.role || '').toLowerCase());
    const period = roleLockedToToday ? 'today' : (req.query.period || 'today');

    const now = new Date();
    let startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    let endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);

    if (period === 'yesterday') {
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 6);
    } else if (period === 'month') {
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    } else if (period === 'year') {
      startDate = new Date(startDate.getFullYear(), 0, 1);
    }

    const salesQuery = { tenantId: req.tenantId, status: 'completed' };
    const stockQuery = { tenantId: req.tenantId };
    
    if (req.query.branchId && mongoose.Types.ObjectId.isValid(req.query.branchId)) {
      salesQuery.branchId = req.query.branchId;
      stockQuery.branchId = req.query.branchId;
    }

    // Inventory/SalesOrder used .populate(), which is a second network round
    // trip after the main query — on a remote MongoDB Atlas cluster that's
    // roughly another ~300ms apiece, on top of everything else in this
    // Promise.all. $lookup joins the same data in the same round trip as the
    // query itself instead.
    const [periodSalesData, totalProducts, stockData, recentSales, creditAgg] = await Promise.all([
      SalesOrder.find({
        ...salesQuery,
        createdAt: { $gte: startDate, $lt: endDate },
      }),
      Product.countDocuments({ tenantId: req.tenantId, isActive: true }),
      Inventory.aggregate([
        { $match: stockQuery },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: '_product' } },
        { $unwind: { path: '$_product', preserveNullAndEmptyArrays: true } },
        { $project: { quantity: 1, reorderLevel: 1, productId: { _id: '$_product._id', name: '$_product.name', reorderLevel: '$_product.reorderLevel' } } },
      ]),
      // No .populate('customerId', 'name') here — the dashboard's recent-sales
      // table only ever reads the plain `customerName` string already stored
      // on the sale itself (see Dashboard.jsx), so the populate was paying for
      // a round trip to fetch data nothing displayed.
      SalesOrder.find(
        // Recent sales are otherwise unbounded in time; a locked role must not
        // see yesterday's orders through this list either.
        roleLockedToToday
          ? { ...salesQuery, createdAt: { $gte: startDate, $lt: endDate } }
          : salesQuery
      )
        .sort('-createdAt')
        .limit(10),
      Customer.aggregate([
        { $match: { tenantId: req.tenantId, outstandingCredit: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$outstandingCredit' }, count: { $sum: 1 } } },
      ]),
    ]);

    // Period sales & orders
    const todaySales = periodSalesData.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
    const totalOrders = periodSalesData.length;

    // Low stock alerts
    let lowStockCount = 0;
    const stockAlerts = [];
    stockData.forEach(item => {
      const reorderLvl = item.productId?.reorderLevel || item.reorderLevel || 10;
      if (item.quantity <= reorderLvl) {
        lowStockCount++;
        stockAlerts.push({
          _id: item._id,
          product: { name: item.productId?.name || 'Unknown Product' },
          quantity: item.quantity,
          reorderLevel: reorderLvl,
        });
      }
    });

    // Dynamic Sales Chart
    const salesChartData = [];
    if (period === 'today' || period === 'yesterday') {
      // 4-hour interval breakdown (00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
      for (let hour = 0; hour < 24; hour += 4) {
        const slotStart = new Date(startDate);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(startDate);
        slotEnd.setHours(hour + 4, 0, 0, 0);
        const slotSales = periodSalesData.filter(s => s.createdAt >= slotStart && s.createdAt < slotEnd);
        const label = `${String(hour).padStart(2, '0')}:00`;
        salesChartData.push({
          date: label,
          total: slotSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0),
        });
      }
    } else {
      // Daily breakdown
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      const step = diffDays > 31 ? Math.ceil(diffDays / 12) : 1;

      for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + step)) {
        const nextD = new Date(d);
        nextD.setDate(d.getDate() + step);
        const daySales = periodSalesData.filter(s => s.createdAt >= d && s.createdAt < nextD);
        salesChartData.push({
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          total: daySales.reduce((sum, s) => sum + (s.grandTotal || 0), 0),
        });
      }
    }

    // Top selling products for selected period
    const productSales = {};
    const productNames = {};
    periodSalesData.forEach(sale => {
      sale.items.forEach(item => {
        if (item.productId) {
          const pid = item.productId.toString();
          productSales[pid] = (productSales[pid] || 0) + (item.quantity || 0);
          productNames[pid] = item.name || pid;
        }
      });
    });

    const topProducts = Object.keys(productSales)
      .map(id => ({ productId: id, name: productNames[id], quantitySold: productSales[id] }))
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5);

    const totalOutstandingCredit = creditAgg[0]?.total || 0;
    const creditCustomersCount = creditAgg[0]?.count || 0;

    res.json({
      success: true,
      data: {
        todaySales,
        totalOrders,
        totalProducts,
        lowStockCount,
        salesChartData,
        topProducts,
        recentSales,
        stockAlerts: stockAlerts.slice(0, 10),
        totalOutstandingCredit,
        creditCustomersCount,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
