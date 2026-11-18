import { printThermalReceipt } from './thermalPrint';

// Maps a saved SalesOrder document onto the thermal receipt template — the
// same field mapping SaleDetail's print button uses, extracted so the POS
// reprint modal shares one implementation instead of drifting its own copy.
export const printSaleReceipt = (sale) => {
  const pDetails = sale.paymentDetails || {};
  const grandTotal = Number(sale.grandTotal || sale.total || 0);
  const isCredit = (sale.paymentMethod || '').toLowerCase().includes('credit')
    || (sale.paymentMethod || '').toLowerCase().includes('pay later');
  // amountPaid in paymentDetails is a credit-sale-only field — for other
  // methods what was actually paid is cashReceived, or the full grandTotal
  // when there's no tendered-vs-change concept (card, mobile money).
  const amountPaid = isCredit
    ? Number(pDetails.amountPaid ?? 0)
    : Number(pDetails.cashReceived ?? sale.amountPaid ?? grandTotal);
  const balanceDue = Number(pDetails.balanceDue ?? Math.max(0, grandTotal - amountPaid));

  printThermalReceipt({
    orderNumber: sale.orderNumber || sale._id,
    date: new Date(sale.createdAt || sale.date).toLocaleString(),
    cashierName: sale.cashierId?.name || sale.cashier?.name || 'Cashier',
    customerName: sale.customerName || sale.customerId?.name || 'Walk-in Customer',
    paymentMethod: sale.paymentMethod || 'Cash',
    paymentDetails: {
      ...pDetails,
      amountPaid,
      balanceDue,
    },
    items: (sale.items || []).map(item => ({
      name: item.name || 'Item',
      qty: item.quantity,
      price: Number(item.price),
    })),
    subtotal: Number(sale.subtotal || sale.total || 0),
    discount: Number(sale.totalDiscount || sale.discount || 0),
    tax: Number(sale.totalTax || sale.tax || 0),
    total: grandTotal,
    change: Number(pDetails.changeReturned || 0),
  });
};
