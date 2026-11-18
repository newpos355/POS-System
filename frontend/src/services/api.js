import axios from 'axios';

const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return '/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
});

// Request interceptor for API calls
// NOTE: Tenant tokens are stored in sessionStorage (tab-isolated) to prevent
// session overlap between the super-admin portal and tenant tabs.
// Super-admin token stays in localStorage (separate portal, separate key).
api.interceptors.request.use(
  (config) => {
    const isSuperAdminReq = config.url && config.url.includes('/super-admin');
    const saToken = localStorage.getItem('superAdminToken');
    // sessionStorage is tab-scoped — cannot bleed to other tabs
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');

    if (isSuperAdminReq && saToken) {
      config.headers.Authorization = `Bearer ${saToken}`;
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for API calls
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config ? error.config.url : '';
      const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/super-admin/login');
      if (!isAuthRoute) {
        if (url.includes('/super-admin') || window.location.pathname.startsWith('/super-admin')) {
          localStorage.removeItem('superAdminToken');
          localStorage.removeItem('superAdminUser');
          if (window.location.pathname !== '/super-admin/login') {
            window.location.href = '/super-admin/login';
          }
        } else {
          // Clear both storages for tenant session
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('user');
          localStorage.removeItem('token');  // legacy fallback cleanup
          localStorage.removeItem('user');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

// API Functions Export
export const AuthAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  exchangeImpersonationCode: (code) => api.post('/auth/impersonate/exchange', { code }),
};

export const UsersAPI = {
  getUsers: (params) => api.get('/users', { params }),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (data) => api.post('/users', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
};

export const BranchesAPI = {
  getBranches: () => api.get('/branches'),
  getBranch: (id) => api.get(`/branches/${id}`),
  createBranch: (data) => api.post('/branches', data),
  updateBranch: (id, data) => api.put(`/branches/${id}`, data),
  deleteBranch: (id) => api.delete(`/branches/${id}`),
};

export const CategoriesAPI = {
  getCategories: () => api.get('/categories'),
  getCategory: (id) => api.get(`/categories/${id}`),
  createCategory: (data) => api.post('/categories', data),
  updateCategory: (id, data) => api.put(`/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/categories/${id}`),
};

export const ProductsAPI = {
  getProducts: (params) => api.get('/products', { params }),
  getProduct: (id) => api.get(`/products/${id}`),
  createProduct: (data) => api.post('/products', data),
  updateProduct: (id, data) => api.put(`/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/products/${id}`),
  uploadProductImages: (id, formData) => api.post(`/products/${id}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
};

export const InventoryAPI = {
  getInventory: (params) => api.get('/inventory', { params }),
  adjustStock: (data) => api.post('/inventory/adjust', data),
  transferStock: (data) => api.post('/inventory/transfer', data),
  getStockMovements: (productId) => api.get(`/inventory/movements/${productId}`),
  getAdjustments: (params) => api.get('/inventory/adjustments', { params }),
  repackStock: (data) => api.post('/inventory/repack', data),
  getRepacks: (params) => api.get('/inventory/repacks', { params }),
};

export const PriceListsAPI = {
  getPriceLists: () => api.get('/price-lists'),
  getPriceList: (id) => api.get(`/price-lists/${id}`),
  createPriceList: (data) => api.post('/price-lists', data),
  updatePriceList: (id, data) => api.put(`/price-lists/${id}`, data),
  deletePriceList: (id) => api.delete(`/price-lists/${id}`),
};

export const TrackingAPI = {
  getSerials: (params) => api.get('/tracking/serials', { params }),
  addSerials: (data) => api.post('/tracking/serials', data),
  updateSerialStatus: (id, status) => api.put(`/tracking/serials/${id}/status`, { status }),
  deleteSerial: (id) => api.delete(`/tracking/serials/${id}`),
  getBatches: (params) => api.get('/tracking/batches', { params }),
  addBatch: (data) => api.post('/tracking/batches', data),
  updateBatch: (id, data) => api.put(`/tracking/batches/${id}`, data),
};

export const CustomersAPI = {
  getCustomers: (params) => api.get('/customers', { params }),
  getCustomer: (id) => api.get(`/customers/${id}`),
  createCustomer: (data) => api.post('/customers', data),
  updateCustomer: (id, data) => api.put(`/customers/${id}`, data),
  deleteCustomer: (id) => api.delete(`/customers/${id}`),
  blockCredit: (id, blocked) => api.patch(`/customers/${id}/credit-block`, { blocked }),
  settleCredit: (id) => api.patch(`/customers/${id}/settle-credit`),
};

export const VendorsAPI = {
  getVendors: (params) => api.get('/vendors', { params }),
  getVendor: (id) => api.get(`/vendors/${id}`),
  createVendor: (data) => api.post('/vendors', data),
  updateVendor: (id, data) => api.put(`/vendors/${id}`, data),
  deleteVendor: (id) => api.delete(`/vendors/${id}`),
};

export const SalesAPI = {
  getSales: (params) => api.get('/sales', { params }),
  getSale: (id) => api.get(`/sales/${id}`),
  createSale: (data) => api.post('/sales', data),
  voidSale: (id) => api.put(`/sales/${id}/void`),
  cancelSaleLines: (id, data) => api.post(`/sales/${id}/cancel-lines`, data),
  getDailySummary: (params) => api.get('/sales/summary', { params }),
  convertToPO: (id, data) => api.post(`/sales/${id}/convert-to-po`, data),
  createDropshipPO: (id, data) => api.post(`/sales/${id}/dropship-po`, data),
  getBackorders: () => api.get('/sales/backorders/list'),
  replenishBackorders: (data) => api.post('/sales/backorders/replenish', data),
  recordPayment: (id, data) => api.post(`/sales/${id}/record-payment`, data),
};

export const HeldBillsAPI = {
  getHeldBills: () => api.get('/held-bills'),
  holdBill: (data) => api.post('/held-bills', data),
  deleteHeldBill: (id) => api.delete(`/held-bills/${id}`),
};

export const ShiftsAPI = {
  getShifts: (params) => api.get('/shifts', { params }),
  getCurrent: () => api.get('/shifts/current'),
  openShift: (data) => api.post('/shifts/open', data),
  addMovement: (id, data) => api.post(`/shifts/${id}/movement`, data),
  closeShift: (id, data) => api.post(`/shifts/${id}/close`, data),
};

export const PicklistsAPI = {
  getPicklists: (params) => api.get('/picklists', { params }),
  getPicklist: (id) => api.get(`/picklists/${id}`),
  createPicklist: (data) => api.post('/picklists', data),
  updateItems: (id, data) => api.put(`/picklists/${id}/items`, data),
  completePicklist: (id, data) => api.put(`/picklists/${id}/complete`, data),
  cancelPicklist: (id) => api.put(`/picklists/${id}/cancel`),
};

export const ShipmentsAPI = {
  getShipments: (params) => api.get('/shipments', { params }),
  getShipment: (id) => api.get(`/shipments/${id}`),
  createShipment: (data) => api.post('/shipments', data),
  updateShipment: (id, data) => api.put(`/shipments/${id}`, data),
  dispatchShipment: (id) => api.put(`/shipments/${id}/dispatch`),
  updateStatus: (id, status) => api.put(`/shipments/${id}/status`, { status }),
  markLabelPrinted: (id) => api.put(`/shipments/${id}/label-printed`),
  cancelShipment: (id) => api.delete(`/shipments/${id}`),
};

export const WaybillsAPI = {
  getWaybills: (params) => api.get('/waybills', { params }),
  getWaybill: (id) => api.get(`/waybills/${id}`),
  createWaybill: (data) => api.post('/waybills', data),
  updateWaybill: (id, data) => api.put(`/waybills/${id}`, data),
  cancelWaybill: (id, data) => api.put(`/waybills/${id}/cancel`, data),
};

export const PurchasesAPI = {
  getPurchaseOrders: (params) => api.get('/purchases', { params }),
  getPurchaseOrder: (id) => api.get(`/purchases/${id}`),
  createPurchaseOrder: (data) => api.post('/purchases', data),
  updatePurchaseOrder: (id, data) => api.put(`/purchases/${id}`, data),
  receiveItems: (id, data) => api.post(`/purchases/${id}/receive`, data),
  deletePurchaseOrder: (id) => api.delete(`/purchases/${id}`),
  recordPayment: (id, data) => api.post(`/purchases/${id}/record-payment`, data),
};

export const TaxRatesAPI = {
  getTaxRates: () => api.get('/tax-rates'),
  createTaxRate: (data) => api.post('/tax-rates', data),
  updateTaxRate: (id, data) => api.put(`/tax-rates/${id}`, data),
  deleteTaxRate: (id) => api.delete(`/tax-rates/${id}`),
};

export const ReportSchedulesAPI = {
  getSchedules: () => api.get('/report-schedules'),
  createSchedule: (data) => api.post('/report-schedules', data),
  updateSchedule: (id, data) => api.put(`/report-schedules/${id}`, data),
  deleteSchedule: (id) => api.delete(`/report-schedules/${id}`),
  runNow: (id) => api.post(`/report-schedules/${id}/run`),
};

export const ReportsAPI = {
  getSalesReport: (params) => api.get('/reports/sales', { params }),
  getInventoryReport: (params) => api.get('/reports/inventory', { params }),
  getPurchaseReport: (params) => api.get('/reports/purchases', { params }),
};

export const DashboardAPI = {
  getDashboard: (params) => api.get('/dashboard', { params }),
};

export const StripeAPI = {
  createCheckoutSession: (planId) => api.post('/stripe/create-checkout-session', { planId }),
  verifySession: (sessionId, planId) => api.post('/stripe/verify-session', { sessionId, planId }),
  getSubscription: () => api.get('/stripe/subscription'),
  getPlans: () => api.get('/stripe/plans'),
};

export const NotificationsAPI = {
  getNotifications: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/mark-all-read'),
  deleteNotification: (id) => api.delete(`/notifications/${id}`),
  clearRead: () => api.delete('/notifications/clear-read'),
};

export const SuperAdminAPI = {
  getStats: () => api.get('/super-admin/stats'),
  getTenants: (params) => api.get('/super-admin/tenants', { params }),
  getTenant: (id) => api.get(`/super-admin/tenants/${id}`),
  updateTenantPlan: (id, data) => api.put(`/super-admin/tenants/${id}/plan`, data),
  updateAddOns: (id, data) => api.put(`/super-admin/tenants/${id}/add-ons`, data),
  updateTenantStatus: (id, data) => api.put(`/super-admin/tenants/${id}/status`, data),
  deleteTenant: (id) => api.delete(`/super-admin/tenants/${id}`),
  impersonateTenant: (id) => api.post(`/super-admin/tenants/${id}/impersonate`), // returns a one-time exchange code, not a token
  getPricingConfig: () => api.get('/super-admin/pricing'),
  updatePricingConfig: (data) => api.put('/super-admin/pricing', data),
  getActivityLogs: (params) => api.get('/super-admin/logs', { params }),
  getSystemStatus: () => api.get('/super-admin/system-status'),
  getSystemSettings: () => api.get('/super-admin/settings'),
  updateSystemSettings: (data) => api.put('/super-admin/settings', data),
};

export const ExpensesAPI = {
  getExpenses: (params) => api.get('/expenses', { params }),
  createExpense: (data) => api.post('/expenses', data),
  updateExpense: (id, data) => api.put(`/expenses/${id}`, data),
  deleteExpense: (id) => api.delete(`/expenses/${id}`),
};

export const ReturnsAPI = {
  getReturns: (params) => api.get('/returns', { params }),
  getReturn: (id) => api.get(`/returns/${id}`),
  createReturn: (data) => api.post('/returns', data),
  approveReturn: (id) => api.put(`/returns/${id}/approve`),
  rejectReturn: (id, data) => api.put(`/returns/${id}/reject`, data),
  getReturnSettings: () => api.get('/returns/settings'),
  updateReturnSettings: (data) => api.put('/returns/settings', data),
};

export const CreditNotesAPI = {
  getCreditNotes: (params) => api.get('/credit-notes', { params }),
  getCreditNote: (id) => api.get(`/credit-notes/${id}`),
  createCreditNote: (data) => api.post('/credit-notes', data),
  voidCreditNote: (id) => api.put(`/credit-notes/${id}/void`),
  getAvailableForCustomer: (customerId) => api.get(`/credit-notes/customer/${customerId}/available`),
};

// Customization: PDF templates, email templates, custom fields, custom views
export const CustomizationAPI = {
  getMeta: () => api.get('/customization/meta'),

  getPdfTemplates: () => api.get('/customization/pdf-templates'),
  resolvePdfTemplate: (documentType) => api.get('/customization/pdf-templates/resolve', { params: { documentType } }),
  createPdfTemplate: (data) => api.post('/customization/pdf-templates', data),
  updatePdfTemplate: (id, data) => api.put(`/customization/pdf-templates/${id}`, data),
  deletePdfTemplate: (id) => api.delete(`/customization/pdf-templates/${id}`),

  getEmailTemplates: () => api.get('/customization/email-templates'),
  createEmailTemplate: (data) => api.post('/customization/email-templates', data),
  updateEmailTemplate: (id, data) => api.put(`/customization/email-templates/${id}`, data),
  deleteEmailTemplate: (id) => api.delete(`/customization/email-templates/${id}`),
  previewEmailTemplate: (data) => api.post('/customization/email-templates/preview', data),
  testEmailTemplate: (id, data) => api.post(`/customization/email-templates/${id}/test`, data),

  getCustomFields: (params) => api.get('/customization/custom-fields', { params }),
  createCustomField: (data) => api.post('/customization/custom-fields', data),
  updateCustomField: (id, data) => api.put(`/customization/custom-fields/${id}`, data),
  deleteCustomField: (id) => api.delete(`/customization/custom-fields/${id}`),

  getCustomViews: () => api.get('/customization/views'),
  createCustomView: (data) => api.post('/customization/views', data),
  updateCustomView: (id, data) => api.put(`/customization/views/${id}`, data),
  deleteCustomView: (id) => api.delete(`/customization/views/${id}`),
  getCustomViewData: (id) => api.get(`/customization/views/${id}/data`),
};

// Automation: workflow rules, webhooks, custom functions/schedulers/buttons
export const AutomationAPI = {
  getMeta: () => api.get('/automation/meta'),

  getWorkflows: () => api.get('/automation/workflows'),
  createWorkflow: (data) => api.post('/automation/workflows', data),
  updateWorkflow: (id, data) => api.put(`/automation/workflows/${id}`, data),
  deleteWorkflow: (id) => api.delete(`/automation/workflows/${id}`),

  getWebhooks: () => api.get('/automation/webhooks'),
  createWebhook: (data) => api.post('/automation/webhooks', data),
  updateWebhook: (id, data) => api.put(`/automation/webhooks/${id}`, data),
  deleteWebhook: (id) => api.delete(`/automation/webhooks/${id}`),
  testWebhook: (id) => api.post(`/automation/webhooks/${id}/test`),
  getWebhookDeliveries: (id) => api.get(`/automation/webhooks/${id}/deliveries`),

  getFunctions: () => api.get('/automation/functions'),
  getButtonsForEntity: (entity) => api.get('/automation/functions/buttons', { params: { entity } }),
  createFunction: (data) => api.post('/automation/functions', data),
  updateFunction: (id, data) => api.put(`/automation/functions/${id}`, data),
  deleteFunction: (id) => api.delete(`/automation/functions/${id}`),
  runFunction: (id, data) => api.post(`/automation/functions/${id}/run`, data),
};

// Extended report API endpoints
export const ExtendedReportsAPI = {
  getProfitLoss: (params) => api.get('/reports/profit-loss', { params }),
  getCashFlow: (params) => api.get('/reports/cash-flow', { params }),
  getActivityLog: (params) => api.get('/reports/activity-log', { params }),
  getFinancialStatement: (params) => api.get('/reports/financial-statement', { params }),
  getReceivables: () => api.get('/reports/receivables'),
  getPayables: () => api.get('/reports/payables'),
  runCustomReport: (config) => api.post('/reports/custom', config),
};

export default api;
