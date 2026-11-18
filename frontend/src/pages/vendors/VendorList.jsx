import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiSearch, FiEdit2, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { VendorsAPI } from '../../services/api';
import './vendors.css';

const VendorList = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Clear legacy localStorage cache
    localStorage.removeItem('pos_vendors');
    localStorage.removeItem('pos_vendors_modified');
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const res = await VendorsAPI.getVendors();
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setVendors(res.data.data);
      }
    } catch (error) {
      console.error('Fetch vendors error:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;
    try {
      await VendorsAPI.deleteVendor(id);
      toast.success('Vendor deleted successfully');
      fetchVendors();
    } catch (error) {
      console.error('Delete vendor error:', error);
      toast.error(error.response?.data?.message || 'Failed to delete vendor');
    }
  };

  const filteredVendors = vendors.filter(v => 
    v.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.company?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vendors & Suppliers</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Manage wholesale suppliers, contacts and purchase orders</p>
        </div>
        <Link to="/vendors/new" className="btn btn-primary">
          <FiPlus /> Add Vendor
        </Link>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
          <FiSearch style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '40px' }}
            placeholder="Search by vendor name or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading vendors from database...</div>
        ) : filteredVendors.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>No vendors found. Click "+ Add Vendor" to create one.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map(vendor => (
                <tr key={vendor.id || vendor._id}>
                  <td><strong>{vendor.name}</strong></td>
                  <td>{vendor.company || 'N/A'}</td>
                  <td>{vendor.email || 'N/A'}</td>
                  <td>{vendor.phone || 'N/A'}</td>
                  <td>
                    <span className={`badge ${vendor.status === 'inactive' ? 'badge-danger' : 'badge-success'}`}>
                      {vendor.status === 'inactive' ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Link to={`/vendors/${vendor.id || vendor._id}/edit`} className="btn btn-outline btn-sm">
                        <FiEdit2 /> Edit
                      </Link>
                      <button onClick={() => handleDelete(vendor.id || vendor._id)} className="btn btn-danger btn-sm">
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default VendorList;
