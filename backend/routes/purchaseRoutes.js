const express = require('express');
const router = express.Router();
const { getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, receiveItems, deletePurchaseOrder, recordPOPayment } = require('../controllers/purchaseController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

router.use(protect);
router.use(tenantScope);

// Cashiers can VIEW purchase orders
// Only admin/manager can create, update, receive, delete
router.route('/')
  .get(getPurchaseOrders)                                             // all roles
  .post(authorize('admin', 'manager'), createPurchaseOrder);

router.route('/:id')
  .get(getPurchaseOrder)                                              // all roles
  .put(authorize('admin', 'manager'), updatePurchaseOrder)
  .delete(authorize('admin', 'manager'), deletePurchaseOrder);

// Receive items — admin/manager only (stock write operation)
router.post('/:id/receive', authorize('admin', 'manager'), receiveItems);
router.put('/:id/receive', authorize('admin', 'manager'), receiveItems);

// Vendor payment against this PO — admin/manager (money out)
router.post('/:id/record-payment', authorize('admin', 'manager'), recordPOPayment);

module.exports = router;
