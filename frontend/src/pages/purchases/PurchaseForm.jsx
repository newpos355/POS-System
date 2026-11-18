import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiTrash2, FiSave, FiSend } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { PurchasesAPI, VendorsAPI, ProductsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { getActiveBranchId } from '../../utils/branch';
import './purchases.css';

const PurchaseForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  
  const [formData, setFormData] = useState({
    vendor: '',
    branch: '',
    expectedDate: '',
    items: [],
    notes: ''
  });

  useEffect(() => {
    fetchVendorsAndProducts();
  }, []);

  const fetchVendorsAndProducts = async () => {
    try {
      const [vRes, pRes] = await Promise.all([
        VendorsAPI.getVendors(),
        ProductsAPI.getProducts()
      ]);
      if (vRes.data?.success && Array.isArray(vRes.data.data)) {
        setVendors(vRes.data.data);
      }
      if (pRes.data?.success && Array.isArray(pRes.data.data)) {
        setProducts(pRes.data.data);
      }
    } catch (error) {
      console.error('Fetch vendors/products error:', error);
      toast.error('Failed to load vendors or products list');
    }
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { product: '', quantity: 1, unitCost: 0 }]
    }));
  };

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    
    // Auto-fill unit cost if product is selected
    if (field === 'product') {
      const prod = products.find(p => (p.id || p._id) === value);
      if (prod) {
        newItems[index].unitCost = prod.costPrice || prod.price || 0;
        newItems[index].name = prod.name;
      }
    }
    
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitCost)), 0);
  };

  const handleSubmit = async (status) => {
    if (!formData.vendor) return toast.error('Please select a vendor');
    if (formData.items.length === 0) return toast.error('Please add at least one item');
    
    // Validate each item
    for (const item of formData.items) {
      if (!item.product) return toast.error('Please select a product for all item rows');
    }

    try {
      setLoading(true);
      const activeBranchId = getActiveBranchId();
      const payload = {
        branchId: activeBranchId || undefined,
        vendorId: formData.vendor,
        vendor: formData.vendor,
        expectedDate: formData.expectedDate,
        notes: formData.notes,
        status,
        items: formData.items.map(item => ({
          productId: item.product,
          product: item.product,
          name: item.name,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
          total: Number(item.quantity) * Number(item.unitCost)
        })),
        grandTotal: calculateSubtotal()
      };
      
      const res = await PurchasesAPI.createPurchaseOrder(payload);
      if (res.data?.success) {
        toast.success(`Purchase Order ${status === 'draft' ? 'saved as draft' : 'placed'} successfully!`);
        navigate('/purchases');
      }
    } catch (error) {
      console.error('Create purchase order error:', error);
      toast.error(error.response?.data?.message || `Failed to ${status === 'draft' ? 'save draft' : 'place order'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Purchase Order</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Create a new purchase order for your suppliers</p>
        </div>
      </div>

      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div className="form-group">
            <label className="form-label">Vendor *</label>
            <select 
              className="form-select"
              value={formData.vendor} 
              onChange={e => setFormData({...formData, vendor: e.target.value})}
              required
            >
              <option value="">Select Vendor</option>
              {vendors.map(v => (
                <option key={v.id || v._id} value={v.id || v._id}>{v.name} {v.company ? `(${v.company})` : ''}</option>
              ))}
            </select>
            {vendors.length === 0 && (
              <small style={{ color: '#E11D48', marginTop: '4px', display: 'block' }}>
                No vendors found. Please create a vendor in Vendors page first.
              </small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Expected Delivery Date</label>
            <input 
              className="form-input"
              type="date" 
              value={formData.expectedDate} 
              onChange={e => setFormData({...formData, expectedDate: e.target.value})}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>Order Items</h3>
          <button type="button" className="btn btn-secondary" onClick={addItem}>
            <FiPlus /> Add Item
          </button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit Cost</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, index) => (
                <tr key={index}>
                  <td>
                    <select 
                      className="form-select"
                      value={item.product}
                      onChange={e => handleItemChange(index, 'product', e.target.value)}
                    >
                      <option value="">Select Product</option>
                      {products.map(p => (
                        <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input 
                      className="form-input"
                      type="number" 
                      min="1" 
                      value={item.quantity}
                      onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                      style={{ width: '80px' }}
                    />
                  </td>
                  <td>
                    <input 
                      className="form-input"
                      type="number" 
                      min="0" 
                      step="0.01"
                      value={item.unitCost}
                      onChange={e => handleItemChange(index, 'unitCost', e.target.value)}
                      style={{ width: '100px' }}
                    />
                  </td>
                  <td><strong>{formatCurrency(Number(item.quantity) * Number(item.unitCost))}</strong></td>
                  <td>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(index)}>
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
              {formData.items.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                    No items added yet. Click "Add Item" to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '300px', backgroundColor: 'var(--background)', padding: '16px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>Subtotal:</span>
              <strong>{formatCurrency(calculateSubtotal())}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '8px', color: '#16A34A' }}>
              <strong>Grand Total:</strong>
              <strong>{formatCurrency(calculateSubtotal())}</strong>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/purchases')}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => handleSubmit('draft')} disabled={loading}>
            <FiSave /> Save as Draft
          </button>
          <button type="button" className="btn btn-primary" onClick={() => handleSubmit('ordered')} disabled={loading}>
            <FiSend /> Place Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseForm;
