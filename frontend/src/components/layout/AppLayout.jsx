import React, { useState, useEffect, Suspense } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  FiHome, FiShoppingCart, FiPackage, FiGrid, FiBox,
  FiUsers, FiTruck, FiShoppingBag, FiDollarSign,
  FiBarChart2, FiSettings, FiMenu, FiBell, FiChevronDown, FiLogOut,
  FiBarChart, FiRotateCcw, FiTrendingDown, FiClock, FiCornerUpLeft, FiSend,
  FiSliders, FiZap
} from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { BranchesAPI, StripeAPI } from '../../services/api';
import NotificationPanel from '../common/NotificationPanel';
import useSessionTimeout from '../../hooks/useSessionTimeout';
import './AppLayout.css';

// Scoped to just the routed page content, not the whole app shell — this is
// what fixed the "sidebar disappears and everything reloads" feeling on the
// first visit to any page. Previously a single top-level <Suspense> wrapped
// the entire route tree including this layout, so loading a not-yet-fetched
// page's JS chunk hid the sidebar/header along with it; a second visit felt
// instant only because the chunk was already cached by then. Scoping
// Suspense to the Outlet keeps the sidebar mounted and interactive while
// only the content area shows a loading state.
const ContentLoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <div style={{ width: '40px', height: '40px', border: '4px solid #E2E8F0', borderTop: '4px solid #16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(() => localStorage.getItem('active_branch_id') || '');
  // Session timeout warning state
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuth();
  const { unreadCount, togglePanel } = useNotifications();
  
  const user = authUser || { 
    name: 'Admin User', 
    role: 'Store Manager', 
    email: 'admin@retailstore.com',
    avatar: 'https://ui-avatars.com/api/?name=Admin+User&background=16A34A&color=fff' 
  };

  const [subscription, setSubscription] = useState({ plan: 'free', planName: 'Free' });

  // ── Session timeout: 30 min for cashiers/managers, 8 h for admins ──────────
  const role = (user.role || 'cashier').toLowerCase();
  const isAdmin = role === 'admin';
  const IDLE_MS = isAdmin
    ? 8 * 60 * 60 * 1000   // 8 hours for admins
    : 30 * 60 * 1000;      // 30 minutes for cashiers & managers

  useSessionTimeout({
    enabled: !!authUser, // only when logged in
    idleMs: IDLE_MS,
    onTimeout: () => {
      logout();
    },
    onWarn: (secs) => {
      setTimeoutWarning(true);
      setSecondsLeft(secs);
    },
    onWarnClear: () => {
      setTimeoutWarning(false);
      setSecondsLeft(60);
    },
  });
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchBranches();
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await StripeAPI.getSubscription();
      if (res.data?.success && res.data.data) {
        setSubscription(res.data.data);
      }
    } catch (err) {
      // Fallback
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await BranchesAPI.getBranches();
      if (res.data?.success && Array.isArray(res.data.data)) {
        setBranches(res.data.data);
        if (res.data.data.length > 0) {
          // Validate the stored id. A stale id (branch deleted/recreated)
          // silently filters every page down to nothing while the dropdown
          // still displays the first branch's name — the user sees "Main
          // Branch" selected but zero sales/stock.
          const stored = localStorage.getItem('active_branch_id') || '';
          const stillValid = stored === 'all' || res.data.data.some(b => b._id === stored);
          if (!stillValid) {
            const defaultB = res.data.data.find(b => b.isDefault) || res.data.data[0];
            setSelectedBranchId(defaultB._id);
            localStorage.setItem('active_branch_id', defaultB._id);
            window.dispatchEvent(new CustomEvent('branchChanged', { detail: { branchId: defaultB._id } }));
          }
        }
      }
    } catch (err) {
      console.error('Fetch header branches error:', err);
    }
  };

  const handleBranchChange = (e) => {
    const bId = e.target.value;
    setSelectedBranchId(bId);
    localStorage.setItem('active_branch_id', bId);
    window.dispatchEvent(new CustomEvent('branchChanged', { detail: { branchId: bId } }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userRole = (user.role || 'cashier').toLowerCase();

  // Define which roles can see each nav item.
  // If 'roles' is omitted or empty, ALL roles can see the item.
  // Cashier can only see: Dashboard, POS Terminal, Inventory, Sales, Expenses, Barcodes, Reports, Settings
  const navItems = [
    { path: '/dashboard',  label: 'Dashboard',   icon: FiHome },
    { path: '/terminal',   label: 'POS Terminal', icon: FiShoppingCart },
    { path: '/products',   label: 'Products',     icon: FiPackage,     roles: ['admin', 'manager'] },
    { path: '/categories', label: 'Categories',   icon: FiGrid,        roles: ['admin', 'manager'] },
    { path: '/inventory',  label: 'Inventory',    icon: FiBox },
    { path: '/customers',  label: 'Customers',    icon: FiUsers,       roles: ['admin', 'manager'] },
    { path: '/vendors',    label: 'Vendors',      icon: FiTruck,       roles: ['admin', 'manager'] },
    { path: '/purchases',  label: 'Purchases',    icon: FiShoppingBag, roles: ['admin', 'manager'] },
    { path: '/sales',      label: 'Sales',        icon: FiDollarSign },
    { path: '/shipments',  label: 'Shipments',    icon: FiSend,        roles: ['admin', 'manager'] },
    { path: '/returns',    label: 'Returns',      icon: FiCornerUpLeft, roles: ['admin', 'manager'] },
    { path: '/store',      label: 'Store Mgmt',   icon: FiRotateCcw,   roles: ['admin', 'manager'] },
    { path: '/expenses',   label: 'Expenses',     icon: FiTrendingDown },
    { path: '/barcodes',   label: 'Barcodes',     icon: FiBarChart },
    { path: '/reports',    label: 'Reports',      icon: FiBarChart2 },
    { path: '/customization', label: 'Customization', icon: FiSliders, roles: ['admin', 'manager'] },
    { path: '/automation', label: 'Automation',   icon: FiZap,         roles: ['admin', 'manager'] },
    { path: '/settings',   label: 'Settings',     icon: FiSettings },
  ].filter(item => !item.roles || item.roles.includes(userRole));

  const getPageTitle = () => {
    const titles = { '/store': 'Store Management', '/expenses': 'Expenses', '/barcodes': 'Barcode Manager', '/credit-notes': 'Credit Notes', '/backorders': 'Backorders', '/waybills': 'Waybills', '/tracking': 'Serial & Batch Tracking', '/price-lists': 'Price Lists', '/due-bills': 'Due Bills', '/shifts': 'Shift Sessions' };
    if (titles[location.pathname]) return titles[location.pathname];
    if (location.pathname.startsWith('/picklists')) return 'Picklists';
    if (location.pathname.startsWith('/shipments')) return 'Shipments';
    const currentItem = navItems.find(item => location.pathname.startsWith(item.path));
    if (currentItem) return currentItem.label;
    if (location.pathname === '/pos' || location.pathname === '/terminal') return 'POS Terminal';
    return 'Dashboard';
  };

  return (
    <div className="app-layout">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-icon"></div>
          <span className="logo-text">POS Platform</span>
        </div>

        {/* On phones the topbar branch selector is hidden (no room), which
            left mobile users stuck on the default branch — and every page
            filters by the selected branch. This copy lives in the sidebar. */}
        <div className="sidebar-branch">
          <label>Branch</label>
          <select value={selectedBranchId} onChange={handleBranchChange}>
            {branches.length === 0 ? (
              <option value="">Main Branch</option>
            ) : (
              <>
                <option value="all">All Branches</option>
                {branches.map(b => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </>
            )}
          </select>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive || (item.path === '/terminal' && location.pathname === '/pos') ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <img src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=16A34A&color=fff`} alt="User" className="user-avatar" />
            <div className="user-details">
              <span className="user-name">{user.name}</span>
              <span className="user-role" style={{ textTransform: 'capitalize' }}>{user.role || 'Admin'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              <FiMenu />
            </button>
            <h1 className="page-title">{getPageTitle()}</h1>
          </div>

          <div className="topbar-right">
            {/* Plan Badge */}
            <div className="plan-badge-topbar" onClick={() => navigate('/pricing')} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: subscription.plan === 'enterprise' ? '#7C3AED15' : subscription.plan === 'business' ? '#16A34A15' : '#3B82F615',
              border: `1px solid ${subscription.plan === 'enterprise' ? '#7C3AED40' : subscription.plan === 'business' ? '#16A34A40' : '#3B82F640'}`,
              borderRadius: '20px',
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: subscription.plan === 'enterprise' ? '#7C3AED' : subscription.plan === 'business' ? '#16A34A' : '#3B82F6',
            }}>
              <span>{subscription.plan === 'enterprise' ? '🛡️' : subscription.plan === 'business' ? '🌟' : '⚡'}</span>
              <span>{subscription.planName || 'Free'} Plan</span>
              {subscription.plan !== 'enterprise' && (
                <span style={{ fontSize: '11px', background: '#16A34A', color: 'white', padding: '2px 6px', borderRadius: '10px' }}>
                  Upgrade
                </span>
              )}
            </div>

            <div className="branch-selector">
              <select value={selectedBranchId} onChange={handleBranchChange}>
                {branches.length === 0 ? (
                  <option value="">Main Branch</option>
                ) : (
                  <>
                    <option value="all">All Branches</option>
                    {branches.map(b => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div style={{ position: 'relative' }}>
              <button className="notification-btn notif-bell-btn" onClick={togglePanel}>
                <FiBell />
                {unreadCount > 0 && (
                  <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>
              <NotificationPanel />
            </div>

            <div className="profile-menu">
              <button 
                className="profile-toggle" 
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              >
                <img src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=16A34A&color=fff`} alt="Profile" className="topbar-avatar" />
                <FiChevronDown />
              </button>

              {profileDropdownOpen && (
                <div className="profile-dropdown">
                  <div className="dropdown-header">
                    <span className="dropdown-name">{user.name}</span>
                    <span className="dropdown-email">{user.email || 'admin@store.com'}</span>
                  </div>
                  <div className="dropdown-divider"></div>
                  <button className="dropdown-item" onClick={() => { setProfileDropdownOpen(false); navigate('/settings'); }}>
                    <FiSettings /> Settings
                  </button>
                  <button className="dropdown-item text-danger" onClick={handleLogout}>
                    <FiLogOut /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="page-content">
          {/* ── Session timeout warning banner ─────────────────────────── */}
          {timeoutWarning && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
              background: 'linear-gradient(90deg, #DC2626, #B91C1C)',
              color: '#fff', padding: '12px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '12px', boxShadow: '0 2px 12px rgba(220,38,38,0.4)',
              animation: 'slideDown 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FiClock style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>
                  Session expiring in <strong>{secondsLeft}s</strong> due to inactivity.
                  Move your mouse or press any key to stay logged in.
                </span>
              </div>
              <button
                onClick={() => { setTimeoutWarning(false); }}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
                  color: '#fff', borderRadius: '8px', padding: '6px 14px',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Stay Logged In
              </button>
            </div>
          )}
          <Suspense fallback={<ContentLoadingFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
