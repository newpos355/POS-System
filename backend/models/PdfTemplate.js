const mongoose = require('mongoose');

// A tenant-designed print/PDF layout for a document type (invoice, receipt,
// quote, purchase order). Templates are structured design settings — colors,
// paper, visibility toggles, label overrides, header/footer text — rendered
// client-side by the document viewers (e.g. InvoiceView). The template marked
// isDefault for its documentType is the one a viewer resolves at print time.
const pdfTemplateSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  name: { type: String, required: true, trim: true },
  documentType: {
    type: String,
    enum: ['invoice', 'receipt', 'quote', 'purchase-order'],
    default: 'invoice',
  },
  isDefault: { type: Boolean, default: false },

  design: {
    accentColor: { type: String, default: '#16A34A' },
    textColor: { type: String, default: '#1E293B' },
    fontFamily: {
      type: String,
      enum: ['Arial', 'Georgia', 'Courier New', 'Times New Roman', 'Verdana'],
      default: 'Arial',
    },
    paperSize: { type: String, enum: ['a4', 'letter', 'thermal-80mm'], default: 'a4' },
    logoUrl: { type: String, default: '' },
    // Free text lines above/below the document body.
    headerText: { type: String, default: '' },
    footerText: { type: String, default: 'Thank you for your business!' },
    // Section visibility toggles.
    showLogo: { type: Boolean, default: true },
    showBusinessInfo: { type: Boolean, default: true },
    showCustomerInfo: { type: Boolean, default: true },
    showCashier: { type: Boolean, default: true },
    showSku: { type: Boolean, default: true },
    showDiscount: { type: Boolean, default: true },
    showTax: { type: Boolean, default: true },
    showPaymentInfo: { type: Boolean, default: true },
    showSignature: { type: Boolean, default: false },
    // Label overrides, e.g. { documentTitle: 'TAX INVOICE', totalLabel: 'AMOUNT DUE' }.
    labels: { type: mongoose.Schema.Types.Mixed, default: {} },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

pdfTemplateSchema.index({ tenantId: 1, documentType: 1 });

module.exports = mongoose.model('PdfTemplate', pdfTemplateSchema);
