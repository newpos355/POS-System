const express = require('express');
const router = express.Router();
const {
  getSchedules, createSchedule, updateSchedule, deleteSchedule, runNow,
} = require('../controllers/reportScheduleController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);
router.use(authorize('admin', 'manager'));

router.route('/')
  .get(getSchedules)
  .post(createSchedule);

router.route('/:id')
  .put(validateObjectIdParam('id'), updateSchedule)
  .delete(validateObjectIdParam('id'), deleteSchedule);

router.post('/:id/run', validateObjectIdParam('id'), runNow);

module.exports = router;
