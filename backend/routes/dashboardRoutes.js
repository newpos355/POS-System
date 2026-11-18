const express = require('express');
const router = express.Router();
const { getDashboard } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

router.use(protect);
router.use(tenantScope);

router.get('/', getDashboard);

module.exports = router;
