import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiSave, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { VendorsAPI } from '../../services/api';
import CustomFieldsSection from '../../components/CustomFieldsSection';
import './vendors.css';

const VendorForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    status: 'active',
    isDropshipper: false,
    leadTimeDays: '',
    customFields: {},
  });

  useEffect(() => {
    if (isEditing) {
      fetchVendor();
    }
  }, [id]);

  const fetchVendor = async () => {
    try {
      setLoading(true);
      const res = await VendorsAPI.getVendor(id);
      if (res.data?.success) {
        setFormData({
          name: res.data.data.name || '',
          company: res.data.data.company || '',
          email: res.data.data.email || '',
          phone: res.data.data.phone || '',
          address: res.data.data.address || '',
          status: res.data.data.status || 'active',
          isDropshipper: !!res.data.data.isDropshipper,
          leadTimeDays: res.data.data.leadTimeDays ?? '',
          customFields: res.data.data.customFields || {},
        });
      }
    } catch (error) {
      toast.error('Failed to fetch vendor details');
      navigate('/vendors');
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
    try {
      setLoading(true);
      const payload = {
        ...formData,
        leadTimeDays: formData.leadTimeDays === '' ? null : Number(formData.leadTimeDays),
      };
      if (isEditing) {
        await VendorsAPI.updateVendor(id, payload);
        toast.success('Vendor updated successfully');
      } else {
        await VendorsAPI.createVendor(payload);
        toast.success('Vendor created successfully');
      }
      localStorage.removeItem('pos_vendors');
      navigate('/vendors');
    } catch (error) {
      console.error('Save vendor error:', error);
      toast.error(error.response?.data?.message || `Failed to ${isEditing ? 'update' : 'create'} vendor`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isEditing ? 'Edit Vendor' : 'Add New Vendor'}</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Fill in the vendor contact details below</p>
        </div>
      </div>

      <div className="card" style={{ padding: '24px', maxWidth: '600px' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Contact Name *</label>
            <input className="form-input" type="text" name="name" value={formData.name} onChange={handleChange} required />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Company Name *</label>
            <input className="form-input" type="text" name="company" value={formData.company} onChange={handleChange} required />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" name="email" value={formData.email} onChange={handleChange} />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Phone Number</label>
            <input className="form-input" type="tel" name="phone" value={formData.phone} onChange={handleChange} />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Address</label>
            <textarea className="form-textarea" name="address" value={formData.address} onChange={handleChange} rows="3"></textarea>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Status</label>
            <select className="form-select" name="status" value={formData.status} onChange={handleChange}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="isDropshipper"
              checked={formData.isDropshipper}
              onChange={e => setFormData(prev => ({ ...prev, isDropshipper: e.target.checked }))}
            />
            <label htmlFor="isDropshipper" style={{ fontWeight: 600, margin: 0 }}>
              Dropshipper — this vendor ships orders directly to customers
            </label>
          </div>

          <div className="form-group" style={{ marginBottom: '16px', maxWidth: '240px' }}>
            <label className="form-label">Lead time (days)</label>
            <input className="form-input" type="number" min="0" name="leadTimeDays"
              value={formData.leadTimeDays} onChange={handleChange}
              placeholder="Used to prefill PO expected dates" />
          </div>

          <CustomFieldsSection
            entity="vendor"
            values={formData.customFields}
            onChange={cf => setFormData(prev => ({ ...prev, customFields: cf }))}
          />

          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/vendors')}>
              <FiX /> Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <FiSave /> {loading ? 'Saving...' : 'Save Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VendorForm;
