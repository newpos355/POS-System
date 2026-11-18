const express = require('express');
const router = express.Router();
const { getBranches, getBranch, createBranch, updateBranch, deleteBranch } = require('../controllers/branchController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

router.use(protect);
router.use(tenantScope);

router.route('/')
  .get(getBranches)
  .post(authorize('admin'), createBranch);

router.route('/:id')
  .get(getBranch)
  .put(authorize('admin'), updateBranch)
  .delete(authorize('admin'), deleteBranch);

module.exports = router;
