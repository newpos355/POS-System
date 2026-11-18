const express = require('express');
const router = express.Router();
const { getHeldBills, holdBill, deleteHeldBill } = require('../controllers/heldBillController');
const { protect } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

// All roles — holding/recalling carts is core cashier work.
router.route('/')
  .get(getHeldBills)
  .post(holdBill);

router.delete('/:id', validateObjectIdParam('id'), deleteHeldBill);

module.exports = router;
