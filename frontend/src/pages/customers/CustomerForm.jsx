import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiSave, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { CustomersAPI, PriceListsAPI } from '../../services/api';
import CustomFieldsSection from '../../components/CustomFieldsSection';
import './customers.css';

const CustomerForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [priceLists, setPriceLists] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    priceListId: '',
    taxExempt: false,
    taxExemptReason: '',
    customFields: {},
  });

  useEffect(() => {
    PriceListsAPI.getPriceLists()
      .then(res => { if (res.data?.success) setPriceLists((res.data.data || []).filter(pl => pl.isActive)); })
      .catch(() => {});
    if (isEditing) {
      fetchCustomer();
    }
  }, [id]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const res = await CustomersAPI.getCustomer(id);
      if (res.data?.success) {
        setFormData({
          name: res.data.data.name || '',
          email: res.data.data.email || '',
          phone: res.data.data.phone || '',
          address: res.data.data.address || '',
          priceListId: res.data.data.priceListId || '',
          taxExempt: !!res.data.data.taxExempt,
          taxExemptReason: res.data.data.taxExemptReason || '',
          customFields: res.data.data.customFields || {},
        });
      }
    } catch (error) {
      toast.error('Failed to fetch customer details');
      navigate('/customers');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return toast.error('Full name is required');
    if (!formData.email.trim()) return toast.error('Email address is required');
    if (!formData.phone.trim()) return toast.error('Phone number is required');

    try {
      setLoading(true);
      const payload = { ...formData, priceListId: formData.priceListId || null };
      if (isEditing) {
        await CustomersAPI.updateCustomer(id, payload);
      } else {
        await CustomersAPI.createCustomer(payload);
      }
      toast.success(`Customer ${isEditing ? 'updated' : 'created'} successfully`);
      navigate('/customers');
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to ${isEditing ? 'update' : 'create'} customer`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isEditing ? 'Edit Customer' : 'Add New Customer'}</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Fill in the customer contact details below</p>
        </div>
      </div>

      <div className="card" style={{ padding: '24px', maxWidth: '600px' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Full Name *</label>
            <input className="form-input" type="text" name="name" value={formData.name} onChange={handleChange} required />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Email Address *</label>
            <input className="form-input" type="email" name="email" value={formData.email} onChange={handleChange} required />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Phone Number *</label>
            <input className="form-input" type="tel" name="phone" value={formData.phone} onChange={handleChange} required />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Address</label>
            <textarea className="form-textarea" name="address" value={formData.address} onChange={handleChange} rows="3"></textarea>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Price List</label>
            <select className="form-select" name="priceListId" value={formData.priceListId} onChange={handleChange}>
              <option value="">Standard prices</option>
              {priceLists.map(pl => (
                <option key={pl._id} value={pl._id}>
                  {pl.name}{pl.type === 'percent' ? ` (${pl.percentage > 0 ? '+' : ''}${pl.percentage}%)` : ''}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Applied automatically when this customer is selected at the POS
            </span>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.taxExempt}
                onChange={e => setFormData(prev => ({ ...prev, taxExempt: e.target.checked }))}
              />
              Tax exempt — sales to this customer carry no tax
            </label>
            {formData.taxExempt && (
              <input
                className="form-input"
                style={{ marginTop: '8px' }}
                name="taxExemptReason"
                placeholder="Reason / certificate number (e.g. NGO cert #12345)"
                value={formData.taxExemptReason}
                onChange={handleChange}
              />
            )}
          </div>

          <CustomFieldsSection
            entity="customer"
            values={formData.customFields}
            onChange={cf => setFormData(prev => ({ ...prev, customFields: cf }))}
          />

          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/customers')}>
              <FiX /> Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <FiSave /> {loading ? 'Saving...' : 'Save Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerForm;
