export const formatCurrency = (amount, currency = 'USD') => {
  if (amount === undefined || amount === null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

export const formatDate = (date, format = 'short') => {
  if (!date) return '';
  const d = new Date(date);
  
  if (format === 'short') {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(d);
  } else if (format === 'long') {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(d);
  }
  return d.toLocaleDateString();
};

export const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
};

export const formatNumber = (num) => {
  if (num === undefined || num === null) return '';
  return new Intl.NumberFormat('en-US').format(num);
};

export const getStatusColor = (status) => {
  if (!status) return 'default';
  
  const statusLower = status.toLowerCase();
  if (['completed', 'active', 'paid', 'delivered'].includes(statusLower)) {
    return 'success';
  } else if (['pending', 'processing', 'in-progress'].includes(statusLower)) {
    return 'warning';
  } else if (['cancelled', 'failed', 'inactive', 'void'].includes(statusLower)) {
    return 'danger';
  } else if (['shipped', 'refunded'].includes(statusLower)) {
    return 'info';
  }
  return 'default';
};

export const getPaymentMethodLabel = (method) => {
  const methods = {
    'cash': 'Cash',
    'card': 'Credit/Debit Card',
    'bank_transfer': 'Bank Transfer',
    'mobile_money': 'Mobile Money',
  };
  return methods[method] || method;
};

export const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};
