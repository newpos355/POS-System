import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

// Layouts
import AppLayout from './components/layout/AppLayout';

// Eager load auth pages (needed immediately)
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';

// Lazy load all other pages for code splitting
const LandingPage = lazy(() => import('./pages/landing/LandingPage'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const POSTerminal = lazy(() => import('./pages/pos/POSTerminal'));
const Pricing = lazy(() => import('./pages/pricing/Pricing'));
const PaymentSuccess = lazy(() => import('./pages/pricing/PaymentSuccess'));
const PaymentCancelled = lazy(() => import('./pages/pricing/PaymentCancelled'));

// Super Admin Portal (lazy)
const SuperAdminLogin = lazy(() => import('./pages/super-admin/SuperAdminLogin'));
const SuperAdminLayout = lazy(() => import('./pages/super-admin/SuperAdminLayout'));
const SuperAdminDashboard = lazy(() => import('./pages/super-admin/SuperAdminDashboard'));
const TenantManagement = lazy(() => import('./pages/super-admin/TenantManagement'));
const PricingConfig = lazy(() => import('./pages/super-admin/PricingConfig'));
const ActivityLogs = lazy(() => import('./pages/super-admin/ActivityLogs'));
const SystemStatus = lazy(() => import('./pages/super-admin/SystemStatus'));
const SystemSettings = lazy(() => import('./pages/super-admin/SystemSettings'));

// Products
const ProductList = lazy(() => import('./pages/products/ProductList'));
const ProductForm = lazy(() => import('./pages/products/ProductForm'));

// Categories
const CategoryList = lazy(() => import('./pages/categories/CategoryList'));

// Inventory
const InventoryList = lazy(() => import('./pages/inventory/InventoryList'));
const TrackingPage = lazy(() => import('./pages/inventory/TrackingPage'));
const PriceListsPage = lazy(() => import('./pages/inventory/PriceListsPage'));

// Customers
const CustomerList = lazy(() => import('./pages/customers/CustomerList'));
const CustomerForm = lazy(() => import('./pages/customers/CustomerForm'));

// Vendors
const VendorList = lazy(() => import('./pages/vendors/VendorList'));
const VendorForm = lazy(() => import('./pages/vendors/VendorForm'));

// Purchases
const PurchaseList = lazy(() => import('./pages/purchases/PurchaseList'));
const PurchaseForm = lazy(() => import('./pages/purchases/PurchaseForm'));

// Sales
const SalesList = lazy(() => import('./pages/sales/SalesList'));
const SaleDetail = lazy(() => import('./pages/sales/SaleDetail'));
const DueBills = lazy(() => import('./pages/sales/DueBills'));
const ShiftsPage = lazy(() => import('./pages/sales/ShiftsPage'));

// Returns & Cancellations
const ReturnsList = lazy(() => import('./pages/returns/ReturnsList'));
const ReturnDetail = lazy(() => import('./pages/returns/ReturnDetail'));

// Credit Notes
const CreditNoteList = lazy(() => import('./pages/credit-notes/CreditNoteList'));

// Fulfillment (backorders, picklists, shipments, waybills)
const BackorderList = lazy(() => import('./pages/fulfillment/BackorderList'));
const PicklistList = lazy(() => import('./pages/fulfillment/PicklistList'));
const PicklistDetail = lazy(() => import('./pages/fulfillment/PicklistDetail'));
const ShipmentList = lazy(() => import('./pages/fulfillment/ShipmentList'));
const ShipmentDetail = lazy(() => import('./pages/fulfillment/ShipmentDetail'));
const WaybillList = lazy(() => import('./pages/fulfillment/WaybillList'));

// Reports & Settings
const Reports = lazy(() => import('./pages/reports/Reports'));
const Settings = lazy(() => import('./pages/settings/Settings'));

// New pages
const BarcodeManager = lazy(() => import('./pages/barcodes/BarcodeManager'));
const StoreManagement = lazy(() => import('./pages/store/StoreManagement'));
const InvoiceView = lazy(() => import('./pages/sales/InvoiceView'));
const Expenses = lazy(() => import('./pages/expenses/Expenses'));
const CustomizationHub = lazy(() => import('./pages/customization/CustomizationHub'));
const AutomationHub = lazy(() => import('./pages/automation/AutomationHub'));

// Protected Route - uses AuthContext and checks subscription plan
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingFallback />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Require an active paid plan (starter, business, enterprise)
  const hasActivePlan = user.plan && user.plan !== 'none' && user.plan !== 'free';
  if (!hasActivePlan) {
    return <Navigate to="/pricing" replace />;
  }

  return children;
};

// Super Admin Route Guard
const SuperAdminRoute = ({ children }) => {
  const saUser = (() => {
    try { return JSON.parse(localStorage.getItem('superAdminUser') || 'null'); } catch { return null; }
  })();
  const saToken = localStorage.getItem('superAdminToken');

  if (!saToken || !saUser || saUser.role !== 'superadmin') {
    return <Navigate to="/super-admin/login" replace />;
  }
  return children;
};

// Loading spinner
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
    <div className="spinner" style={{ width: '48px', height: '48px', border: '4px solid #E2E8F0', borderTop: '4px solid #16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
    <p style={{ color: '#64748B', fontSize: '14px' }}>Loading...</p>
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/payment-cancelled" element={<PaymentCancelled />} />

        {/* Super Admin Portal */}
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />
        <Route
          path="/super-admin"
          element={
            <SuperAdminRoute>
              <SuperAdminLayout />
            </SuperAdminRoute>
          }
        >
          <Route index element={<Navigate to="/super-admin/dashboard" replace />} />
          <Route path="dashboard" element={<SuperAdminDashboard />} />
          <Route path="tenants" element={<TenantManagement />} />
          <Route path="pricing" element={<PricingConfig />} />
          <Route path="logs" element={<ActivityLogs />} />
          <Route path="status" element={<SystemStatus />} />
          <Route path="settings" element={<SystemSettings />} />
        </Route>

        {/* Fullscreen Dedicated POS Terminal */}
        <Route
          path="/pos"
          element={
            <ProtectedRoute>
              <POSTerminal />
            </ProtectedRoute>
          }
        />

        {/* App Routes with Sidebar Layout */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/terminal" element={<POSTerminal />} />

          {/* Products */}
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/new" element={<ProductForm />} />
          <Route path="/products/:id/edit" element={<ProductForm />} />

          {/* Categories */}
          <Route path="/categories" element={<CategoryList />} />

          {/* Inventory */}
          <Route path="/inventory" element={<InventoryList />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/price-lists" element={<PriceListsPage />} />

          {/* Customers */}
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/customers/new" element={<CustomerForm />} />
          <Route path="/customers/:id/edit" element={<CustomerForm />} />

          {/* Vendors */}
          <Route path="/vendors" element={<VendorList />} />
          <Route path="/vendors/new" element={<VendorForm />} />
          <Route path="/vendors/:id/edit" element={<VendorForm />} />

          {/* Purchases */}
          <Route path="/purchases" element={<PurchaseList />} />
          <Route path="/purchases/new" element={<PurchaseForm />} />
          <Route path="/purchases/:id/edit" element={<PurchaseForm />} />

          {/* Sales */}
          <Route path="/sales" element={<SalesList />} />
          <Route path="/sales/:id" element={<SaleDetail />} />
          <Route path="/due-bills" element={<DueBills />} />
          <Route path="/shifts" element={<ShiftsPage />} />

          {/* Returns & Cancellations */}
          <Route path="/returns" element={<ReturnsList />} />
          <Route path="/returns/:id" element={<ReturnDetail />} />

          {/* Credit Notes */}
          <Route path="/credit-notes" element={<CreditNoteList />} />

          {/* Fulfillment */}
          <Route path="/backorders" element={<BackorderList />} />
          <Route path="/picklists" element={<PicklistList />} />
          <Route path="/picklists/:id" element={<PicklistDetail />} />
          <Route path="/shipments" element={<ShipmentList />} />
          <Route path="/shipments/:id" element={<ShipmentDetail />} />
          <Route path="/waybills" element={<WaybillList />} />

          {/* Reports & Settings */}
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/customization" element={<CustomizationHub />} />
          <Route path="/automation" element={<AutomationHub />} />

          {/* New Pages */}
          <Route path="/barcodes" element={<BarcodeManager />} />
          <Route path="/store" element={<StoreManagement />} />
          <Route path="/sales/:id/invoice" element={<InvoiceView />} />
          <Route path="/expenses" element={<Expenses />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#0F172A',
                color: '#fff',
                borderRadius: '8px',
                fontSize: '14px',
              },
              success: {
                iconTheme: { primary: '#16A34A', secondary: '#fff' },
              },
              error: {
                iconTheme: { primary: '#EF4444', secondary: '#fff' },
              },
            }}
          />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
