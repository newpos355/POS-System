/**
 * Global currency utility for POS Platform
 * Currency and symbol are saved in localStorage under 'pos_currency'
 */

export const CURRENCIES = [
  { code: 'UGX', symbol: 'UGX', name: 'Ugandan Shilling', locale: 'en-UG' },
  { code: 'USD', symbol: '$',   name: 'US Dollar',        locale: 'en-US' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling',  locale: 'en-KE' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', locale: 'en-TZ' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi',    locale: 'en-GH' },
  { code: 'NGN', symbol: '₦',   name: 'Nigerian Naira',   locale: 'en-NG' },
  { code: 'ZAR', symbol: 'R',   name: 'South African Rand', locale: 'en-ZA' },
  { code: 'EUR', symbol: '€',   name: 'Euro',              locale: 'de-DE' },
  { code: 'GBP', symbol: '£',   name: 'British Pound',     locale: 'en-GB' },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc',    locale: 'en-RW' },
];

export const getCurrency = () => {
  try {
    const saved = localStorage.getItem('pos_currency');
    if (saved) return JSON.parse(saved);
  } catch {}
  return CURRENCIES[0]; // default UGX
};

export const setCurrency = (currencyObj) => {
  localStorage.setItem('pos_currency', JSON.stringify(currencyObj));
};

/**
 * Format a number as currency using the stored currency settings
 * @param {number} value
 * @param {boolean} compact - Use compact notation for large numbers
 */
export const formatCurrency = (value, compact = false) => {
  const cur = getCurrency();
  const num = Number(value || 0);
  if (compact && num >= 1_000_000) {
    return `${cur.symbol} ${(num / 1_000_000).toFixed(1)}M`;
  }
  if (compact && num >= 1_000) {
    return `${cur.symbol} ${(num / 1_000).toFixed(1)}K`;
  }
  return `${cur.symbol} ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const getCurrencySymbol = () => getCurrency().symbol;
