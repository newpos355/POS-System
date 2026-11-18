import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiSearch, FiEdit2, FiTrash2, FiDownload, FiUpload } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { CustomersAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import './customers.css';

const CustomerList = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Clear legacy localStorage cache
    localStorage.removeItem('pos_customers');
    localStorage.removeItem('pos_customers_modified');
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await CustomersAPI.getCustomers();
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setCustomers(res.data.data);
      }
    } catch (error) {
      console.error('Fetch customers error:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    try {
      await CustomersAPI.deleteCustomer(id);
      toast.success('Customer deleted successfully');
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete customer');
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  const fileInputRef = useRef(null);

  const exportCSV = () => {
    if (!customers.length) return toast.error('No customers to export');
    const rows = customers.map(c => ({
      Name: c.name || '',
      Email: c.email || '',
      Phone: c.phone || '',
      TotalPurchases: c.totalPurchases || 0,
      TotalSpent: c.totalSpent || 0,
    }));
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'customers.csv'; a.click();
    toast.success(`Exported ${rows.length} customers`);
  };

  const importCSV = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return toast.error('Empty or invalid CSV');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    let created = 0, failed = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx]?.trim() || ''; });
      if (!row.name) continue;
      try {
        await CustomersAPI.createCustomer({ name: row.name, email: row.email || '', phone: row.phone || '' });
        created++;
      } catch { failed++; }
    }
    toast.success(`Imported: ${created} customers${failed ? `, ${failed} failed` : ''}`);
    fetchCustomers();
    e.target.value = '';
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Manage client directory, contact info and sales history</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" onClick={exportCSV}><FiDownload /> Export CSV</button>
          <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}><FiUpload /> Import CSV</button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={importCSV} style={{ display: 'none' }} />
          <Link to="/customers/new" className="btn btn-primary"><FiPlus /> Add Customer</Link>
        </div>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
          <FiSearch style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '40px' }}
            placeholder="Search by name, email or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading customers from database...</div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            No customers found. Click "+ Add Customer" to create one.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th style={{ textAlign: 'center' }}>Orders</th>
                <th style={{ textAlign: 'right' }}>Total Spent</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(customer => {
                const orders = customer.totalOrders ?? customer.totalPurchases ?? 0;
                const spent  = customer.totalSpent ?? 0;
                return (
                  <tr key={customer.id || customer._id}>
                    <td><strong>{customer.name}</strong></td>
                    <td style={{ color: '#64748B' }}>{customer.email || 'N/A'}</td>
                    <td>{customer.phone || 'N/A'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: orders > 0 ? '#DCFCE7' : '#F1F5F9',
                          color:      orders > 0 ? '#16A34A' : '#94A3B8',
                        }}
                      >
                        {orders} {orders === 1 ? 'Order' : 'Orders'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <strong style={{ color: spent > 0 ? '#16A34A' : '#94A3B8' }}>
                        {formatCurrency(spent)}
                      </strong>
                      {customer.storeCreditBalance > 0 && (
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600 }}>
                            {formatCurrency(customer.storeCreditBalance)} store credit
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Link to={`/customers/${customer.id || customer._id}/edit`} className="btn btn-outline btn-sm">
                          <FiEdit2 /> Edit
                        </Link>
                        <button onClick={() => handleDelete(customer.id || customer._id)} className="btn btn-danger btn-sm">
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CustomerList;
