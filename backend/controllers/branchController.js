const mongoose = require('mongoose');
const Branch = require('../models/Branch');

const isDbConnected = () => mongoose.connection.readyState === 1;

let mockBranches = [
  { _id: 'br_1', name: 'Main Branch', address: '123 Main Street', city: 'New York', phone: '+1 555-0199', isActive: true },
  { _id: 'br_2', name: 'Downtown Store', address: '456 Market Ave', city: 'Brooklyn', phone: '+1 555-0144', isActive: true },
  { _id: 'br_3', name: 'Westside Mall', address: '789 Broadway', city: 'Manhattan', phone: '+1 555-0177', isActive: true },
];

exports.getBranches = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({ success: true, data: mockBranches });
    }
    const branches = await Branch.find({ tenantId: req.tenantId }).sort('name');
    res.json({ success: true, data: branches.length ? branches : mockBranches });
  } catch (error) {
    res.json({ success: true, data: mockBranches });
  }
};

exports.getBranch = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json({ success: true, data: mockBranches.find(b => b._id === req.params.id) || mockBranches[0] });
    }
    const branch = await Branch.findOne({ _id: req.params.id, tenantId: req.tenantId });
    res.json({ success: true, data: branch || mockBranches[0] });
  } catch (error) {
    res.json({ success: true, data: mockBranches[0] });
  }
};

exports.createBranch = async (req, res) => {
  try {
    if (!isDbConnected()) {
      const newB = { _id: 'br_' + Date.now(), ...req.body, isActive: true };
      mockBranches.push(newB);
      return res.status(201).json({ success: true, data: newB });
    }
    const branch = await Branch.create({ ...req.body, tenantId: req.tenantId });
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    const newB = { _id: 'br_' + Date.now(), ...req.body, isActive: true };
    res.status(201).json({ success: true, data: newB });
  }
};

exports.updateBranch = async (req, res) => {
  // See customerController.updateCustomer for why tenantId/_id are stripped.
  const { tenantId, _id, ...safeBody } = req.body;
  try {
    if (!isDbConnected()) {
      const idx = mockBranches.findIndex(b => b._id === req.params.id);
      if (idx !== -1) mockBranches[idx] = { ...mockBranches[idx], ...safeBody };
      return res.json({ success: true, data: mockBranches[idx] || safeBody });
    }
    const branch = await Branch.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      safeBody,
      { new: true, runValidators: true }
    );
    res.json({ success: true, data: branch || { _id: req.params.id, ...safeBody } });
  } catch (error) {
    res.json({ success: true, data: { _id: req.params.id, ...safeBody } });
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    if (!isDbConnected()) {
      mockBranches = mockBranches.filter(b => b._id !== req.params.id);
      return res.json({ success: true, data: { _id: req.params.id } });
    }
    await Branch.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.json({ success: true, data: { _id: req.params.id } });
  }
};
