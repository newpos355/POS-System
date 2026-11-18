const express = require('express');
const router  = express.Router();
const {
  getProducts, getProduct, createProduct, updateProduct, deleteProduct, uploadImages,
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { upload, handleUploadError } = require('../middleware/upload');
const { validateCreateProduct, validateObjectIdParam } = require('../middleware/validate');

router.use(protect);
router.use(tenantScope);

router.route('/')
  .get(getProducts)
  .post(
    authorize('admin', 'manager'),
    upload.array('images', 5),
    handleUploadError,            // ← catches file type/size errors
    validateCreateProduct,        // ← validates product fields
    createProduct,
  );

router.route('/:id')
  .get(validateObjectIdParam('id'), getProduct)
  .put(authorize('admin', 'manager'), validateObjectIdParam('id'), updateProduct)
  .delete(authorize('admin', 'manager'), validateObjectIdParam('id'), deleteProduct);

router.post('/:id/images',
  authorize('admin', 'manager'),
  validateObjectIdParam('id'),
  upload.array('images', 5),
  handleUploadError,
  uploadImages,
);

module.exports = router;
