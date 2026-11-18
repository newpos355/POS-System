const express = require('express');
const router = express.Router();
const {
  openShift, getCurrentShift, addMovement, closeShift, getShifts,
} = require('../controllers/shiftController');
const { protect } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

// All roles — every cashier manages their own drawer. Ownership is enforced
// in the controller (a session can only be moved/closed by its cashier), and
// history visibility is role-scoped there too.
router.get('/', getShifts);
router.post('/open', openShift);
router.get('/current', getCurrentShift);
router.post('/:id/movement', validateObjectIdParam('id'), addMovement);
router.post('/:id/close', validateObjectIdParam('id'), closeShift);

module.exports = router;
