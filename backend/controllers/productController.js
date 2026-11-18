const mongoose = require('mongoose');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Branch = require('../models/Branch');
const Category = require('../models/Category');
const { emitEvent } = require('../services/automationEngine');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isDbConnected = () => mongoose.connection.readyState === 1;

// Helper: get default branch for a tenant
const getDefaultBranch = async (tenantId) => {
  return await Branch.findOne({ tenantId, isDefault: true })
    || await Branch.findOne({ tenantId });
};

// Helper: upload image to Cloudinary
const processImageUpload = async (imageData) => {
  if (!imageData) return null;
  if (typeof imageData === 'string' && imageData.startsWith('http')) {
    return imageData;
  }
  if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
    try {
      const uploadRes = await cloudinary.uploader.upload(imageData, {
        folder: 'pos_products',
        quality: 'auto',
        fetch_format: 'auto',
      });
      return uploadRes.secure_url;
    } catch (err) {
      console.error('Cloudinary upload error:', err.message);
      return imageData;
    }
  }
  return imageData;
};

// Helper: resolve Category ID from ID string or Category Name string
const resolveCategoryId = async (catInput, tenantId) => {
  if (!catInput) return null;
  if (mongoose.Types.ObjectId.isValid(catInput)) {
    return catInput;
  }
  // Try to find category by name if a string name was passed
  const found = await Category.findOne({ tenantId, name: { $regex: new RegExp(`^${catInput}$`, 'i') } });
  return found ? found._id : null;
};

// ─── GET ALL PRODUCTS ──────────────────────────────────────────────────────────
exports.getProducts = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const query = { tenantId: req.tenantId };
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { sku: { $regex: req.query.search, $options: 'i' } },
        { barcode: { $regex: req.query.search, $options: 'i' } },
        { 'attributes.imei': { $regex: req.query.search, $options: 'i' } },
        { 'attributes.serialNumber': { $regex: req.query.search, $options: 'i' } },
      ];
    }
    if (req.query.categoryId) query.categoryId = req.query.categoryId;

    // Single aggregation instead of find()+populate()+a separate Inventory
    // query: each of those was its own network round trip to MongoDB Atlas,
    // and on a remote cluster that's ~300ms apiece — three sequential round
    // trips is most of why this endpoint (and POS Terminal, which calls it)
    // felt slow. $lookup joins category and branch-inventory data in the same
    // trip as the product query itself.
    const hasBranch = req.query.branchId && mongoose.Types.ObjectId.isValid(req.query.branchId);
    const pipeline = [
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: 'categories', localField: 'categoryId', foreignField: '_id', as: '_category' } },
      { $unwind: { path: '$_category', preserveNullAndEmptyArrays: true } },
    ];
    if (hasBranch) {
      const branchObjectId = new mongoose.Types.ObjectId(req.query.branchId);
      pipeline.push(
        {
          $lookup: {
            from: 'inventories',
            let: { pid: '$_id' },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ['$productId', '$$pid'] }, { $eq: ['$branchId', branchObjectId] }, { $eq: ['$tenantId', req.tenantId] }] } } },
            ],
            as: '_inv',
          },
        },
        { $unwind: { path: '$_inv', preserveNullAndEmptyArrays: true } },
      );
    }

    const [total, products] = await Promise.all([
      Product.countDocuments(query),
      Product.aggregate(pipeline),
    ]);

    // Map `category` field as object/name for backward compatibility with frontend
    const mapped = products.map(p => {
      const obj = { ...p };
      // Match .populate('categoryId', 'name')'s exact shape — the frontend
      // reads both obj.category (string) and obj.categoryId.name directly.
      obj.categoryId = p._category ? { _id: p._category._id, name: p._category.name } : p.categoryId;
      obj.category = p._category ? p._category.name : 'Uncategorized';
      delete obj._category;
      if (hasBranch) {
        // Inventory record exists for this branch — always trust it (even if 0 = sold out).
        // If no inventory record for this branch yet, fall back to Product.stock (already in obj).
        if (p._inv) obj.stock = p._inv.quantity;
      }
      delete obj._inv;
      return obj;
    });

    res.json({
      success: true,
      data: mapped,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET SINGLE PRODUCT ────────────────────────────────────────────────────────
exports.getProduct = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('categoryId', 'name');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const inventory = await Inventory.find({ productId: product._id, tenantId: req.tenantId })
      .populate('branchId', 'name');

    const obj = product.toObject();
    obj.category = product.categoryId ? (product.categoryId._id || product.categoryId) : '';

    res.json({ success: true, data: { ...obj, inventory } });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE PRODUCT ────────────────────────────────────────────────────────────
exports.createProduct = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    let imageUrl = null;
    if (req.body.image) {
      imageUrl = await processImageUpload(req.body.image);
    }

    const initialStock = Number(req.body.stock) || 0;

    // Resolve category ID from categoryId or category field
    const catInput = req.body.categoryId || req.body.category;
    const resolvedCatId = await resolveCategoryId(catInput, req.tenantId);

    const productData = {
      ...req.body,
      categoryId: resolvedCatId || undefined,
      image: imageUrl || req.body.image || '',
      images: imageUrl ? [imageUrl] : (req.body.images || []),
      stock: initialStock,
      tenantId: req.tenantId,
    };

    // Named tax rate: denormalize the percentage onto taxRate so the POS
    // reads one number (see models/TaxRate.js).
    if (productData.taxRateId) {
      const TaxRate = require('../models/TaxRate');
      const tr = mongoose.Types.ObjectId.isValid(productData.taxRateId)
        ? await TaxRate.findOne({ _id: productData.taxRateId, tenantId: req.tenantId })
        : null;
      if (!tr) {
        return res.status(400).json({ success: false, message: 'Selected tax rate not found.' });
      }
      productData.taxRate = tr.rate;
    }

    const product = await Product.create(productData);

    // Auto-create Inventory record for default branch
    const branch = await getDefaultBranch(req.tenantId);
    if (branch) {
      await Inventory.findOneAndUpdate(
        { productId: product._id, branchId: branch._id, tenantId: req.tenantId },
        {
          $set: {
            quantity: initialStock,
            reorderLevel: product.reorderLevel || 10,
            lastUpdated: new Date(),
          }
        },
        { upsert: true, new: true }
      );
    }

    const populated = await Product.findById(product._id).populate('categoryId', 'name');
    const resObj = populated.toObject();
    resObj.category = populated.categoryId ? populated.categoryId.name : 'Uncategorized';

    // Automation: workflow rules & webhooks subscribed to new products.
    emitEvent(req.tenantId, 'product.created', { product });

    res.status(201).json({ success: true, data: resObj });
  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A product with this SKU already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE PRODUCT ────────────────────────────────────────────────────────────
exports.updateProduct = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    let imageUrl = req.body.image;
    if (req.body.image && req.body.image.startsWith('data:image')) {
      imageUrl = await processImageUpload(req.body.image);
    }

    // See customerController.updateCustomer for why tenantId/_id are stripped.
    const { tenantId, _id, ...safeBody } = req.body;
    const updateObj = { ...safeBody };
    if (imageUrl) {
      updateObj.image = imageUrl;
      if (imageUrl.startsWith('http')) {
        updateObj.images = [imageUrl];
      }
    }

    const catInput = req.body.categoryId || req.body.category;
    if (catInput) {
      const resolvedCatId = await resolveCategoryId(catInput, req.tenantId);
      if (resolvedCatId) updateObj.categoryId = resolvedCatId;
    }

    // Named tax rate: keep the denormalized taxRate number in sync (see
    // the matching block in createProduct).
    if (updateObj.taxRateId) {
      const TaxRate = require('../models/TaxRate');
      const tr = mongoose.Types.ObjectId.isValid(updateObj.taxRateId)
        ? await TaxRate.findOne({ _id: updateObj.taxRateId, tenantId: req.tenantId })
        : null;
      if (!tr) {
        return res.status(400).json({ success: false, message: 'Selected tax rate not found.' });
      }
      updateObj.taxRate = tr.rate;
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      updateObj,
      { new: true, runValidators: true }
    ).populate('categoryId', 'name');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (req.body.stock !== undefined) {
      const branch = await getDefaultBranch(req.tenantId);
      if (branch) {
        await Inventory.findOneAndUpdate(
          { productId: product._id, branchId: branch._id, tenantId: req.tenantId },
          { $set: { quantity: Number(req.body.stock), lastUpdated: new Date() } },
          { upsert: true }
        );
      }
    }

    const resObj = product.toObject();
    resObj.category = product.categoryId ? product.categoryId.name : 'Uncategorized';

    res.json({ success: true, data: resObj });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE PRODUCT ────────────────────────────────────────────────────────────
exports.deleteProduct = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    await Inventory.deleteMany({ productId: req.params.id, tenantId: req.tenantId });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPLOAD IMAGES ─────────────────────────────────────────────────────────────
exports.uploadImages = async (req, res) => {
  try {
    if (!req.body.image) {
      return res.status(400).json({ success: false, message: 'No image provided.' });
    }
    const imageUrl = await processImageUpload(req.body.image);
    res.json({ success: true, data: { _id: req.params.id, imageUrl } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
