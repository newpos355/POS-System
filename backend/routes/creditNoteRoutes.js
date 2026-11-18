const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');
const {
  getCreditNotes, getCreditNote, createCreditNote, voidCreditNote, getAvailableForCustomer,
} = require('../controllers/creditNoteController');

router.use(protect);
router.use(tenantScope);

// Must come before '/:id' so 'customer' isn't parsed as an ObjectId param.
router.get('/customer/:customerId/available', getAvailableForCustomer);

router.route('/')
  .get(getCreditNotes)
  .post(authorize('admin'), createCreditNote);

router.route('/:id')
  .get(validateObjectIdParam('id'), getCreditNote);

router.put('/:id/void', validateObjectIdParam('id'), authorize('admin'), voidCreditNote);

module.exports = router;
