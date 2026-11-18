const crypto = require('crypto');

const generateOrderNumber = (prefix = 'SO') => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${dateStr}-${randomStr}`;
};

const generateBarcode = () => {
  // generates random 13-digit EAN-like barcode
  const randomStr = Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
  
  // Calculate check digit (EAN-13)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(randomStr[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return `${randomStr}${checkDigit}`;
};

const generatePONumber = () => {
  return generateOrderNumber('PO');
};

const generateTransferNumber = () => {
  return generateOrderNumber('TR');
};

module.exports = {
  generateOrderNumber,
  generateBarcode,
  generatePONumber,
  generateTransferNumber,
};
