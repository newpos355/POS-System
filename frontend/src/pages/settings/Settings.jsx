import React, { useState, useEffect } from 'react';
import { FiSave, FiPlus, FiEdit, FiTrash2, FiX, FiUser, FiMapPin, FiUsers, FiDollarSign, FiKey, FiCheck, FiGlobe, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { AuthAPI, BranchesAPI, UsersAPI, TaxRatesAPI } from '../../services/api';
import { CURRENCIES, getCurrency, setCurrency as saveCurrency } from '../../utils/currency';
import TaxRatesManager from './TaxRatesManager';
import './settings.css';

// ─── Modal Component ────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="settings-modal">
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="modal-close" onClick={onClose}><FiX /></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

// ─── Settings Page ────────────────────────────────────────────────────────────
const Settings = () => {
  const { user, updateToken } = useAuth();
  const isCashier = user?.role === 'cashier';
  const [activeTab, setActiveTab] = useState('profile');

  // Profile state
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Branches state
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchForm, setBranchForm] = useState({ name: '', address: '', city: '', phone: '', email: '' });

  // Users state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', phone: '', password: '', role: 'cashier' });

  // Currency state
  const [currency, setCurrencyState] = useState(() => getCurrency());

  const handleSaveCurrency = () => {
    saveCurrency(currency);
    toast.success(`Currency set to ${currency.name} (${currency.symbol})`);
  };

  // Receipt & Business Info state
  const [receiptTemplate, setReceiptTemplate] = useState(() => localStorage.getItem('pos_receipt_template') || 'standard');
  const [businessInfo, setBusinessInfo] = useState({
    name: localStorage.getItem('pos_business_name') || '',
    address: localStorage.getItem('pos_business_address') || '',
    phone: localStorage.getItem('pos_business_phone') || '',
    tin: localStorage.getItem('pos_business_tin') || '',
    invoiceFooter: localStorage.getItem('pos_invoice_footer') || 'Thank you for your business!',
  });

  const handleSaveBusinessInfo = () => {
    localStorage.setItem('pos_receipt_template', receiptTemplate);
    Object.entries(businessInfo).forEach(([k, v]) => localStorage.setItem(`pos_business_${k}`, v));
    localStorage.setItem('pos_invoice_footer', businessInfo.invoiceFooter);
    toast.success('Business info & receipt template saved!');
  };

  // Tax & Payments state. localStorage is only a per-machine cache — the
  // real source of truth is the ★ default TaxRate on the server, otherwise
  // every laptop shows a different tax percentage.
  const [taxRate, setTaxRate] = useState(() => {
    return localStorage.getItem('pos_tax_rate') || '0';
  });

  useEffect(() => {
    TaxRatesAPI.getTaxRates()
      .then(res => {
        if (!res.data?.success) return;
        const def = (res.data.data || []).find(t => t.isDefault && t.isActive);
        if (def) {
          setTaxRate(String(def.rate));
          try { localStorage.setItem('pos_tax_rate', String(def.rate)); } catch {}
        }
      })
      .catch(() => {});
  }, []);
  const [paymentMethods, setPaymentMethods] = useState(() => {
    const saved = localStorage.getItem('pos_payment_methods');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return { cash: true, card: true, mobile: true, split: true };
  });

  const handleTogglePaymentMethod = (id) => {
    setPaymentMethods(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveTaxAndPayments = async () => {
    localStorage.setItem('pos_tax_rate', taxRate);
    localStorage.setItem('pos_payment_methods', JSON.stringify(paymentMethods));

    // Persist the rate server-side as the tenant's ★ default named rate so
    // every device converges on the same percentage. We only ever manage a
    // rate literally named "Default" — user-created rates (e.g. "VAT 18%")
    // keep their values and simply lose ★ status.
    try {
      const rateNum = parseFloat(taxRate);
      if (Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 100) {
        const res = await TaxRatesAPI.getTaxRates();
        const rates = res.data?.data || [];
        const managed = rates.find(t => t.name === 'Default');
        if (managed) {
          await TaxRatesAPI.updateTaxRate(managed._id, { rate: rateNum, isDefault: true, isActive: true });
        } else {
          await TaxRatesAPI.createTaxRate({ name: 'Default', rate: rateNum, isDefault: true });
        }
      }
      toast.success('Tax and payment settings saved for all devices');
    } catch (err) {
      toast.error('Saved on this device only — could not sync tax rate to the server');
    }
  };

  // ── Data Fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'branches') fetchBranches();
    if (activeTab === 'users') fetchUsers();
  }, [activeTab]);

  const fetchBranches = async () => {
    setLoadingBranches(true);
    try {
      const res = await BranchesAPI.getBranches();
      if (res.data?.success && Array.isArray(res.data.data)) {
        setBranches(res.data.data);
      }
    } catch (err) {
      console.error('Fetch branches error:', err);
      toast.error('Failed to load branches');
    } finally {
      setLoadingBranches(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await UsersAPI.getUsers();
      if (res.data?.success && Array.isArray(res.data.data)) {
        setUsers(res.data.data);
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  // ── Profile Update ──────────────────────────────────────────────────────────
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      await AuthAPI.updateProfile({ name: profile.name, phone: profile.phone });
      toast.success('Profile updated successfully');
    } catch { toast.error('Failed to update profile'); }
    finally { setSavingProfile(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (profile.newPassword !== profile.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (profile.newPassword.length < 8 || !/[A-Z]/.test(profile.newPassword) || !/[a-z]/.test(profile.newPassword) || !/[0-9]/.test(profile.newPassword)) {
      return toast.error('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number');
    }
    try {
      setSavingProfile(true);
      const res = await AuthAPI.changePassword({ oldPassword: profile.currentPassword, newPassword: profile.newPassword });
      // Changing the password invalidates every previously issued token — the
      // server hands back a fresh one so this tab's own session keeps working.
      if (res.data?.data?.token) updateToken(res.data.data.token);
      toast.success('Password changed successfully');
      setProfile(p => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setSavingProfile(false); }
  };

  // ── Branch CRUD ─────────────────────────────────────────────────────────────
  const openBranchModal = (branch = null) => {
    setEditingBranch(branch);
    setBranchForm(branch
      ? { name: branch.name, address: branch.address || '', city: branch.city || '', phone: branch.phone || '', email: branch.email || '' }
      : { name: '', address: '', city: '', phone: '', email: '' }
    );
    setShowBranchModal(true);
  };

  const handleSaveBranch = async (e) => {
    e.preventDefault();
    if (!branchForm.name.trim()) return toast.error('Branch name is required');
    try {
      if (editingBranch) {
        const res = await BranchesAPI.updateBranch(editingBranch._id || editingBranch.id, branchForm);
        setBranches(prev => prev.map(b => (b._id || b.id) === (editingBranch._id || editingBranch.id) ? res.data.data : b));
        toast.success('Branch updated');
      } else {
        const res = await BranchesAPI.createBranch(branchForm);
        setBranches(prev => [...prev, res.data.data]);
        toast.success('Branch created');
      }
      setShowBranchModal(false);
    } catch { toast.error('Failed to save branch'); }
  };

  const handleDeleteBranch = async (id) => {
    if (!window.confirm('Delete this branch? This cannot be undone.')) return;
    try {
      await BranchesAPI.deleteBranch(id);
      setBranches(prev => prev.filter(b => (b._id || b.id) !== id));
      toast.success('Branch deleted');
    } catch { toast.error('Failed to delete branch'); }
  };

  // ── User CRUD ───────────────────────────────────────────────────────────────
  const openUserModal = (u = null) => {
    setEditingUser(u);
    setUserForm(u
      ? { name: u.name, email: u.email, phone: u.phone || '', password: '', role: u.role || 'cashier' }
      : { name: '', email: '', phone: '', password: '', role: 'cashier' }
    );
    setShowUserModal(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email) return toast.error('Name and email are required');
    if (!editingUser && !userForm.password) return toast.error('Password is required for new users');
    try {
      if (editingUser) {
        const payload = { name: userForm.name, email: userForm.email, phone: userForm.phone, role: userForm.role };
        const res = await UsersAPI.updateUser(editingUser._id || editingUser.id, payload);
        setUsers(prev => prev.map(u => (u._id || u.id) === (editingUser._id || editingUser.id) ? res.data.data : u));
        toast.success('User updated');
      } else {
        const res = await UsersAPI.createUser(userForm);
        setUsers(prev => [...prev, res.data.data]);
        toast.success('User created');
      }
      setShowUserModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save user');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    try {
      await UsersAPI.deleteUser(id);
      setUsers(prev => prev.filter(u => (u._id || u.id) !== id));
      toast.success('User deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const roleColors = { admin: '#DC2626', manager: '#D97706', cashier: '#16A34A' };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Manage your business profile, branches and team</p>
        </div>
      </div>

      <div className="settings-layout">
        {/* Sidebar */}
        <div className="settings-sidebar">
          {[
            { id: 'profile', icon: <FiUser />, label: 'My Profile' },
            { id: 'password', icon: <FiKey />, label: 'Change Password' },
            ...(!isCashier ? [
          { id: 'branches',  icon: <FiMapPin />,   label: 'Branches' },
          { id: 'users',     icon: <FiUsers />,    label: 'Users & Roles' },
          { id: 'tax',       icon: <FiDollarSign />, label: 'Tax & Payments' },
          { id: 'currency',  icon: <FiGlobe />,    label: 'Currency' },
          { id: 'receipt',   icon: <FiFileText />, label: 'Receipt & Invoice' },
        ] : []),
          ].map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {/* ── Profile Tab ─────────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <div className="settings-card">
              <h2>My Profile</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px', paddingBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #16A34A, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'white', fontWeight: '700', flexShrink: 0 }}>
                  {(profile.name || user?.name || 'A').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{user?.name || 'Store Admin'}</h3>
                  <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0 0' }}>{user?.email}</p>
                  <span style={{ background: roleColors[user?.role] || '#16A34A', color: 'white', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', textTransform: 'uppercase' }}>
                    {user?.role || 'admin'}
                  </span>
                </div>
              </div>
              <form onSubmit={handleSaveProfile}>
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label className="form-label">Full Name</label>
                    <input className="form-input" type="text" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input className="form-input" type="email" value={profile.email} disabled style={{ opacity: 0.6 }} />
                    <small style={{ color: '#64748B', fontSize: '11px' }}>Email cannot be changed</small>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input className="form-input" type="text" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="form-actions mt-6">
                  <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                    <FiSave /> {savingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Password Tab ─────────────────────────────────────────────── */}
          {activeTab === 'password' && (
            <div className="settings-card">
              <h2>Change Password</h2>
              <p style={{ color: '#64748B', fontSize: '14px', marginBottom: '24px' }}>Use a strong password with at least 6 characters</p>
              <form onSubmit={handleChangePassword} style={{ maxWidth: '400px' }}>
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <input className="form-input" type="password" value={profile.currentPassword} onChange={e => setProfile(p => ({ ...p, currentPassword: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input className="form-input" type="password" value={profile.newPassword} onChange={e => setProfile(p => ({ ...p, newPassword: e.target.value }))} required minLength={6} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <input className="form-input" type="password" value={profile.confirmPassword} onChange={e => setProfile(p => ({ ...p, confirmPassword: e.target.value }))} required />
                </div>
                <div className="form-actions mt-6">
                  <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                    <FiKey /> {savingProfile ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Branches Tab ─────────────────────────────────────────────── */}
          {activeTab === 'branches' && !isCashier && (
            <div className="settings-card">
              <div className="flex-between">
                <h2>Branches</h2>
                <button className="btn btn-primary" onClick={() => openBranchModal()}>
                  <FiPlus /> Add Branch
                </button>
              </div>

              {loadingBranches ? (
                <p style={{ padding: '20px', color: '#64748B' }}>Loading branches...</p>
              ) : (
                <div className="table-container mt-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Branch Name</th>
                        <th>City</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branches.map(b => (
                        <tr key={b._id || b.id}>
                          <td>
                            <strong>{b.name}</strong>
                            {b.address && <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>{b.address}</p>}
                          </td>
                          <td>{b.city || '—'}</td>
                          <td>{b.phone || '—'}</td>
                          <td><span className={`badge ${b.isActive !== false ? 'badge-success' : 'badge-danger'}`}>{b.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button className="btn btn-outline btn-sm" onClick={() => openBranchModal(b)}><FiEdit /></button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBranch(b._id || b.id)}><FiTrash2 /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {branches.length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', color: '#64748B', padding: '32px' }}>No branches found. Add your first branch.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Users Tab ─────────────────────────────────────────────────── */}
          {activeTab === 'users' && !isCashier && (
            <div className="settings-card">
              <div className="flex-between">
                <h2>Users & Roles</h2>
                <button className="btn btn-primary" onClick={() => openUserModal()}>
                  <FiPlus /> Add User
                </button>
              </div>

              {loadingUsers ? (
                <p style={{ padding: '20px', color: '#64748B' }}>Loading users...</p>
              ) : (
                <div className="table-container mt-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone (SMS OTP)</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u._id || u.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${roleColors[u.role] || '#16A34A'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: roleColors[u.role] || '#16A34A', fontWeight: '700', fontSize: '13px', flexShrink: 0 }}>
                                {(u.name || 'U').charAt(0).toUpperCase()}
                              </div>
                              <strong>{u.name}</strong>
                            </div>
                          </td>
                          <td style={{ color: '#64748B', fontSize: '13px' }}>{u.email}</td>
                          <td>
                            {u.phone ? (
                              <span style={{ color: '#16A34A', fontWeight: '600', fontSize: '13px' }}>{u.phone}</span>
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '12px' }}>Not configured</span>
                            )}
                          </td>
                          <td>
                            <span style={{ background: `${roleColors[u.role] || '#16A34A'}15`, color: roleColors[u.role] || '#16A34A', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize' }}>
                              {u.role || 'cashier'}
                            </span>
                          </td>
                          <td><span className={`badge ${u.isActive !== false ? 'badge-success' : 'badge-danger'}`}>{u.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button className="btn btn-outline btn-sm" onClick={() => openUserModal(u)}><FiEdit /></button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u._id || u.id)}><FiTrash2 /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr><td colSpan="6" style={{ textAlign: 'center', color: '#64748B', padding: '32px' }}>No users found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Currency Tab ─────────────────────────────────────────────── */}
          {activeTab === 'currency' && !isCashier && (
            <div className="settings-card">
              <h2>Currency Settings</h2>
              <p style={{ color: '#64748B', fontSize: '14px', marginBottom: '24px' }}>Select the currency used across sales, reports, and receipts</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {CURRENCIES.map(cur => (
                  <div key={cur.code} onClick={() => setCurrencyState(cur)} style={{ border: `2px solid ${currency.code === cur.code ? '#16A34A' : 'var(--border)'}`, borderRadius: '12px', padding: '16px', cursor: 'pointer', background: currency.code === cur.code ? '#F0FDF4' : 'var(--surface)', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#16A34A' }}>{cur.symbol}</div>
                    <div style={{ fontWeight: 700, marginTop: '4px' }}>{cur.code}</div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>{cur.name}</div>
                    {currency.code === cur.code && <div style={{ marginTop: '6px', fontSize: '11px', color: '#16A34A', fontWeight: 700 }}>✓ Active</div>}
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={handleSaveCurrency}>
                <FiSave /> Save Currency
              </button>
            </div>
          )}

          {/* ── Receipt & Invoice Tab ─────────────────────────────────────── */}
          {activeTab === 'receipt' && !isCashier && (
            <div className="settings-card">
              <h2>Receipt & Invoice Settings</h2>

              <h3 style={{ fontSize: '15px', marginBottom: '12px', marginTop: '20px' }}>Receipt Template</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '24px' }}>
                {[{ id:'minimal', label:'Minimal', desc:'Order # + items + total only' }, { id:'standard', label:'Standard', desc:'Full receipt with cashier, tax, footer' }, { id:'detailed', label:'Detailed', desc:'Standard + payment details + merchant copy' }].map(t => (
                  <div key={t.id} onClick={() => setReceiptTemplate(t.id)} style={{ border: `2px solid ${receiptTemplate === t.id ? '#16A34A' : 'var(--border)'}`, borderRadius: '12px', padding: '16px', cursor: 'pointer', background: receiptTemplate === t.id ? '#F0FDF4' : 'var(--surface)' }}>
                    <div style={{ fontWeight: 700 }}>{t.label}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{t.desc}</div>
                    {receiptTemplate === t.id && <div style={{ marginTop: '6px', fontSize: '11px', color: '#16A34A', fontWeight: 700 }}>✓ Selected</div>}
                  </div>
                ))}
              </div>

              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Business Information</h3>
              <div className="form-grid">
                {[{ key:'name', label:'Business Name', placeholder:'My POS Store' }, { key:'address', label:'Address', placeholder:'Kampala, Uganda' }, { key:'phone', label:'Phone', placeholder:'+256 700 000 000' }, { key:'tin', label:'TIN / Tax Number', placeholder:'TIN: 1234567890' }].map(f => (
                  <div key={f.key} className="form-group">
                    <label className="form-label">{f.label}</label>
                    <input className="form-input" type="text" value={businessInfo[f.key] || ''} onChange={e => setBusinessInfo(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                  </div>
                ))}
                <div className="form-group full-width">
                  <label className="form-label">Invoice Footer Text</label>
                  <textarea className="form-input" rows={2} value={businessInfo.invoiceFooter} onChange={e => setBusinessInfo(p => ({ ...p, invoiceFooter: e.target.value }))} style={{ resize: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div className="form-actions mt-6">
                <button className="btn btn-primary" onClick={handleSaveBusinessInfo}><FiSave /> Save Settings</button>
              </div>
            </div>
          )}

          {/* ── Tax & Payments Tab ─────────────────────────────────────────── */}
          {activeTab === 'tax' && !isCashier && (
            <div className="settings-card">
              <h2>Tax & Payment Settings</h2>

              <div className="form-group" style={{ maxWidth: '300px', marginTop: '20px' }}>
                <label className="form-label">Default Tax Rate (%)</label>
                <input
                  className="form-input"
                  type="number"
                  value={taxRate}
                  onChange={e => setTaxRate(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                />
                <small style={{ color: '#64748B', fontSize: '12px' }}>Saving stores this on the server as the ★ "Default" rate below — it applies on every device</small>
              </div>

              <TaxRatesManager />

              <h3 style={{ marginTop: '28px', marginBottom: '16px', fontSize: '15px' }}>Payment Methods</h3>
              <div className="payment-method-list">
                {[
                  { id: 'cash', label: 'Cash', icon: '💵', desc: 'Accept physical cash payments' },
                  { id: 'card', label: 'Credit / Debit Card', icon: '💳', desc: 'Accept card payments via POS terminal' },
                  { id: 'mobile', label: 'Mobile Money', icon: '📱', desc: 'Accept mobile wallet payments' },
                  { id: 'split', label: 'Split Payment', icon: '✂️', desc: 'Allow customers to pay with multiple methods' },
                ].map(method => (
                  <div key={method.id} className="payment-method-row">
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <span style={{ fontSize: '24px' }}>{method.icon}</span>
                      <div>
                        <p style={{ fontWeight: '600', margin: 0 }}>{method.label}</p>
                        <p style={{ color: '#64748B', fontSize: '13px', margin: '2px 0 0' }}>{method.desc}</p>
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={!!paymentMethods[method.id]}
                        onChange={() => handleTogglePaymentMethod(method.id)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="form-actions mt-6">
                <button className="btn btn-primary" onClick={handleSaveTaxAndPayments}>
                  <FiSave /> Save Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Branch Modal ───────────────────────────────────────────────────── */}
      {showBranchModal && (
        <Modal title={editingBranch ? 'Edit Branch' : 'Add New Branch'} onClose={() => setShowBranchModal(false)}>
          <form onSubmit={handleSaveBranch}>
            <div className="form-group">
              <label className="form-label">Branch Name *</label>
              <input className="form-input" type="text" value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} required autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">City</label>
                <input className="form-input" type="text" value={branchForm.city} onChange={e => setBranchForm(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" type="text" value={branchForm.phone} onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input className="form-input" type="text" value={branchForm.address} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={branchForm.email} onChange={e => setBranchForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowBranchModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><FiCheck /> {editingBranch ? 'Save Changes' : 'Create Branch'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── User Modal ─────────────────────────────────────────────────────── */}
      {showUserModal && (
        <Modal title={editingUser ? 'Edit User' : 'Add New User'} onClose={() => setShowUserModal(false)}>
          <form onSubmit={handleSaveUser}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" type="text" value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input className="form-input" type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number (for SMS OTP Login)</label>
              <input
                className="form-input"
                type="tel"
                value={userForm.phone || ''}
                onChange={e => setUserForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="+256 700 000000 or +92 300 000000"
              />
            </div>
            {!editingUser && (
              <div className="form-group">
                <label className="form-label">Password *</label>
                <input className="form-input" type="password" value={userForm.password} onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} required minLength={6} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Role *</label>
              <select className="form-select" value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}>
                <option value="cashier">Cashier</option>
                <option value="manager">Branch Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowUserModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><FiCheck /> {editingUser ? 'Save Changes' : 'Create User'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Settings;
