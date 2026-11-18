const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── GET ALL CATEGORIES ────────────────────────────────────────────────────────
exports.getCategories = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const categories = await Category.find({ tenantId: req.tenantId, isActive: true }).sort('name');

    // Attach product count for each category
    const withCount = await Promise.all(
      categories.map(async (cat) => {
        const productCount = await Product.countDocuments({
          tenantId: req.tenantId,
          categoryId: cat._id,
          isActive: true,
        });
        return { ...cat.toObject(), productCount };
      })
    );

    res.json({ success: true, data: withCount });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET SINGLE CATEGORY ───────────────────────────────────────────────────────
exports.getCategory = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const cat = await Category.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!cat) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    res.json({ success: true, data: cat });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE CATEGORY ───────────────────────────────────────────────────────────
exports.createCategory = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    const category = await Category.create({ ...req.body, tenantId: req.tenantId });
    res.status(201).json({ success: true, data: { ...category.toObject(), productCount: 0 } });
  } catch (error) {
    console.error('Create category error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category name already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE CATEGORY ───────────────────────────────────────────────────────────
exports.updateCategory = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    // See customerController.updateCustomer for why tenantId/_id are stripped.
    const { tenantId, _id, ...safeBody } = req.body;
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      safeBody,
      { new: true, runValidators: true }
    );
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE CATEGORY ───────────────────────────────────────────────────────────
exports.deleteCategory = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not available.' });
  }

  try {
    // Check if products exist in this category
    const productCount = await Product.countDocuments({
      tenantId: req.tenantId,
      categoryId: req.params.id,
    });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete — ${productCount} product(s) are in this category. Reassign them first.`,
      });
    }

    await Category.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
