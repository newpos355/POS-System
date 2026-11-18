const express = require('express');
const router  = express.Router();
const {
  getUsers, getUser, createUser, updateUser, deleteUser,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { validateCreateUser, validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

router.route('/')
  .get(authorize('admin', 'manager'), getUsers)
  .post(authorize('admin'), validateCreateUser, createUser);

router.route('/:id')
  .get(authorize('admin', 'manager'), validateObjectIdParam('id'), getUser)
  .put(authorize('admin'), validateObjectIdParam('id'), updateUser)
  .delete(authorize('admin'), validateObjectIdParam('id'), deleteUser);

module.exports = router;
