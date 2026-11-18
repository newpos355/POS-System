import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FiArrowLeft, FiPrinter, FiXCircle, FiFileText, FiRotateCcw,
  FiShoppingBag, FiList, FiTruck, FiPackage,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { SalesAPI, PicklistsAPI, AutomationAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { printThermalReceipt } from '../pos/thermalPrint';
import ReturnModal from '../returns/ReturnModal';
import ConvertToPOModal from './ConvertToPOModal';
import ShipmentModal from './ShipmentModal';
import { useAuth } from '../../contexts/AuthContext';
import './sales.css';

const FULFILLMENT_BADGE = {
  pending: <span className="badge badge-warning">Fulfillment Pending</span>,
  partially_fulfilled: <span className="badge badge-info">Partially Fulfilled</span>,
  fulfilled: <span className="badge badge-success">Fulfilled</span>,
  cancelled: <span className="badge badge-danger">Fulfillment Cancelled</span>,
};

const SaleDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = ['admin', 'manager'].includes((user?.role || '').toLowerCase());
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  // Tenant-defined custom buttons for the sale page (Automation → Functions).
  const [customButtons, setCustomButtons] = useState([]);

  useEffect(() => {
    fetchSaleDetail();
    AutomationAPI.getButtonsForEntity('salesOrder')
      .then(res => { if (res.data?.success) setCustomButtons(res.data.data || []); })
      .catch(() => {});
  }, [id]);

  const handleCustomButton = async (fn) => {
    const t = toast.loading(`Running "${fn.name}"...`);
    try {
      const res = await AutomationAPI.runFunction(fn._id, { recordId: id });
      toast.dismiss(t);
      if (res.data?.success) toast.success(res.data.message || `"${fn.name}" done`);
      else toast.error(res.data?.message || `"${fn.name}" failed`);
    } catch (error) {
      toast.dismiss(t);
      toast.error(error.response?.data?.message || `"${fn.name}" failed`);
    }
  };

  const fetchSaleDetail = async () => {
    try {
      setLoading(true);
      const res = await SalesAPI.getSale(id);
      if (res.data && res.data.success && res.data.data) {
        setSale(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load sale details.');
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async () => {
    if (!window.confirm('Are you sure you want to void this sale?')) return;
    try {
      await SalesAPI.voidSale(id);
      toast.success('Sale voided successfully');
      setSale(prev => ({ ...prev, status: 'voided' }));
    } catch (error) {
      toast.error('Failed to void sale.');
    }
  };

  // Cancels a still-pending order (e.g. mobile money awaiting confirmation)
  // in full — distinct from voidSale, which only ever applies to a
  // 'completed' order. Releases every line's reserved stock.
  const handleCancelOrder = async () => {
    if (!window.confirm('Cancel this order? Reserved stock will be released.')) return;
    setCancelling(true);
    try {
      const res = await SalesAPI.cancelSaleLines(id, {
        lines: (sale.items || []).map(i => ({ productId: i.productId, quantity: i.quantity })),
        reason: 'Changed Mind',
      });
      if (res.data?.success) {
        toast.success('Order cancelled.');
        setSale(res.data.data.sale);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  const handleCreatePicklist = async () => {
    setBusy(true);
    try {
      const res = await PicklistsAPI.createPicklist({ salesOrderId: id });
      if (res.data?.success) {
        toast.success(`Picklist ${res.data.data.picklistNumber} created`);
        navigate(`/picklists/${res.data.data._id}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create picklist');
    } finally {
      setBusy(false);
    }
  };

  const handleDropshipPO = async () => {
    if (!window.confirm('Create dropship purchase order(s) for this sale\'s dropship lines?')) return;
    setBusy(true);
    try {
      const res = await SalesAPI.createDropshipPO(id);
      if (res.data?.success) {
        const pos = res.data.data || [];
        toast.success(`Created ${pos.length} dropship PO(s): ${pos.map(p => p.poNumber).join(', ')}`);
        fetchSaleDetail();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create dropship PO');
    } finally {
      setBusy(false);
    }
  };

  // Print thermal receipt using the configured template
  const handlePrintReceipt = () => {
    if (!sale) return;

    const pDetails = sale.paymentDetails || {};
    const grandTotal = Number(sale.grandTotal || sale.total || 0);
    const isCreditPrint = (sale.paymentMethod || '').toLowerCase().includes('credit') ||
                          (sale.paymentMethod || '').toLowerCase().includes('pay later');
    // amountPaid in paymentDetails is a credit-sale-only field (defaults to 0
    // in the schema for every other payment method) — for cash/card/mobile
    // money, what was actually paid is cashReceived, or the full grandTotal
    // when there's no "tendered vs change" concept (card, mobile money).
    const amountPaid = isCreditPrint
      ? Number(pDetails.amountPaid ?? 0)
      : Number(pDetails.cashReceived ?? sale.amountPaid ?? grandTotal);
    const balanceDue = Number(pDetails.balanceDue ?? sale.creditBalance ?? Math.max(0, grandTotal - amountPaid));

    printThermalReceipt({
      orderNumber:   sale.orderNumber || sale._id,
      date:          new Date(sale.createdAt || sale.date).toLocaleString(),
      cashierName:   sale.cashierId?.name || sale.cashier?.name || 'Cashier',
      customerName:  sale.customerName || sale.customerId?.name || sale.customer?.name || 'Walk-in Customer',
      paymentMethod: sale.paymentMethod || 'Cash',
      paymentDetails: {
        ...pDetails,
        amountPaid,
        balanceDue,
        balanceDueDate: pDetails.balanceDueDate || sale.creditDueDate,
      },
      items: (sale.items || []).map(item => ({
        name:  item.product?.name || item.name || 'Item',
        qty:   item.quantity,
        price: Number(item.price),
      })),
      subtotal: Number(sale.subtotal || sale.total || 0),
      discount: Number(sale.totalDiscount || sale.discount || 0),
      tax:      Number(sale.totalTax || sale.tax || 0),
      taxRate:  sale.taxRate || 0,
      total:    grandTotal,
      change:   Number(pDetails.changeReturned || sale.change || 0),
    });
  };

  if (loading) return (
    <div className="page-container">
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading...</div>
    </div>
  );

  if (!sale) return (
    <div className="page-container">
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Sale not found</div>
    </div>
  );

  // Credit sale calculations
  const isCredit = (sale.paymentMethod || '').toLowerCase().includes('credit') ||
                   (sale.paymentMethod || '').toLowerCase().includes('pay later');
  const pDetails  = sale.paymentDetails || {};
  const grandTotal = Number(sale.grandTotal || sale.total || 0);
  // See handlePrintReceipt above for why amountPaid can't just read
  // pDetails.amountPaid for non-credit sales.
  const amountPaid = isCredit
    ? Number(pDetails.amountPaid ?? 0)
    : Number(pDetails.cashReceived ?? sale.amountPaid ?? grandTotal);
  const balanceDue = Number(pDetails.balanceDue ?? sale.creditBalance ?? Math.max(0, grandTotal - amountPaid));

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/sales')}>
            <FiArrowLeft /> Back
          </button>
          <h1 className="page-title">Order {sale.orderNumber}</h1>
          <span className={`badge ${sale.status === 'voided' ? 'badge-danger' : sale.status === 'pending' ? 'badge-warning' : 'badge-success'}`}>
            {sale.status === 'voided' ? 'Voided' : sale.status === 'pending' ? 'Pending' : 'Completed'}
          </span>
          {FULFILLMENT_BADGE[sale.fulfillmentStatus] || null}
          {sale.hasBackorder && <span className="badge badge-warning">Has Backorder</span>}
          {sale.hasDropship && <span className="badge badge-info">Has Dropship</span>}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {sale.status === 'pending' && (
            <button className="btn btn-danger" onClick={handleCancelOrder} disabled={cancelling}>
              <FiXCircle /> {cancelling ? 'Cancelling...' : 'Cancel Order'}
            </button>
          )}
          {sale.status === 'completed' && (
            <button className="btn btn-outline" onClick={() => setShowReturnModal(true)}>
              <FiRotateCcw /> Return Items
            </button>
          )}
          {sale.status !== 'voided' && sale.status !== 'pending' && (
            <button className="btn btn-danger" onClick={handleVoid}>
              <FiXCircle /> Void Sale
            </button>
          )}
          {canManage && sale.status !== 'voided' && (
            <>
              <button className="btn btn-outline" onClick={() => setShowConvertModal(true)} disabled={busy}>
                <FiShoppingBag /> Convert to PO
              </button>
              {sale.hasDropship
                && (sale.items || []).some(i => i.fulfillmentMode === 'dropship' && !i.purchaseOrderId) && (
                <button className="btn btn-outline" onClick={handleDropshipPO} disabled={busy}>
                  <FiTruck /> Create Dropship PO
                </button>
              )}
              <button className="btn btn-outline" onClick={handleCreatePicklist} disabled={busy}>
                <FiList /> Create Picklist
              </button>
              <button className="btn btn-outline" onClick={() => setShowShipmentModal(true)} disabled={busy}>
                <FiPackage /> Create Shipment
              </button>
            </>
          )}
          {customButtons.map(fn => (
            <button key={fn._id} className="btn btn-outline" title={fn.description || fn.name} onClick={() => handleCustomButton(fn)}>
              ⚡ {fn.name}
            </button>
          ))}
          <Link to={`/sales/${id}/invoice`} className="btn btn-outline">
            <FiFileText /> Invoice
          </Link>
          <button className="btn btn-primary" onClick={handlePrintReceipt}>
            <FiPrinter /> Print Receipt
          </button>
        </div>
      </div>

      {showReturnModal && (
        <ReturnModal
          sale={sale}
          onClose={() => setShowReturnModal(false)}
          onSuccess={fetchSaleDetail}
        />
      )}

      {showConvertModal && (
        <ConvertToPOModal
          sale={sale}
          onClose={() => setShowConvertModal(false)}
          onSuccess={fetchSaleDetail}
        />
      )}

      {showShipmentModal && (
        <ShipmentModal
          sale={sale}
          onClose={() => setShowShipmentModal(false)}
          onSuccess={fetchSaleDetail}
        />
      )}

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B' }}>Customer Details</h4>
          <p><strong>Name:</strong> {sale.customerName || sale.customerId?.name || sale.customer?.name || 'Walk-in Customer'}</p>
          {sale.customer?.email && <p><strong>Email:</strong> {sale.customer.email}</p>}
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B' }}>Order Details</h4>
          <p><strong>Date:</strong> {new Date(sale.createdAt || sale.date).toLocaleString()}</p>
          <p><strong>Cashier:</strong> {sale.cashierId?.name || sale.cashier?.name || 'System'}</p>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#64748B' }}>Payment Information</h4>
          <p><strong>Method:</strong> {sale.paymentMethod || 'Cash'}</p>
          {isCredit ? (
            <>
              <p><strong>Amount Paid:</strong> {formatCurrency(amountPaid)}</p>
              <p style={{ color: balanceDue > 0 ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                <strong>Balance Due:</strong> {formatCurrency(balanceDue)}
              </p>
              {pDetails.balanceDueDate && (
                <p style={{ fontSize: '12px', color: '#64748B' }}>
                  <strong>Due By:</strong> {new Date(pDetails.balanceDueDate).toLocaleDateString()}
                </p>
              )}
              {balanceDue <= 0 && (
                <span style={{ background: '#F0FDF4', color: '#16A34A', fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                  ✓ FULLY PAID
                </span>
              )}
            </>
          ) : (
            <>
              <p><strong>Amount Paid:</strong> {formatCurrency(amountPaid)}</p>
              <p><strong>Change:</strong> {formatCurrency(Number(pDetails.changeReturned || sale.change || 0))}</p>
            </>
          )}
        </div>
      </div>

      {/* Credit sale banner */}
      {isCredit && balanceDue > 0 && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px',
          padding: '14px 20px', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '22px' }}>📋</span>
          <div>
            <p style={{ fontWeight: 700, color: '#DC2626', margin: 0 }}>
              Credit Sale — Balance Outstanding: {formatCurrency(balanceDue)}
            </p>
            {pDetails.balanceDueDate && (
              <p style={{ fontSize: '13px', color: '#B91C1C', margin: '2px 0 0' }}>
                Due by: {new Date(pDetails.balanceDueDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="table-container" style={{ marginBottom: '24px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '44px' }}>#</th>
              <th>Item</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Price</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items || []).map((item, index) => (
              <tr key={index}>
                <td style={{ color: '#64748B', fontWeight: 600 }}>{index + 1}</td>
                <td>
                  <strong>{item.product?.name || item.name}</strong>
                  <span style={{ display: 'inline-flex', gap: '6px', marginLeft: '8px', verticalAlign: 'middle' }}>
                    {item.fulfillmentMode === 'dropship' && <span className="badge badge-info">Dropship</span>}
                    {Number(item.backorderedQty || 0) > 0 && (
                      <span className="badge badge-warning">Backordered ×{item.backorderedQty}</span>
                    )}
                    {Number(item.shippedQty || 0) > 0 && (
                      <span className="badge badge-success">Shipped {item.shippedQty}/{Number(item.quantity) - Number(item.cancelledQty || 0)}</span>
                    )}
                    {Number(item.cancelledQty || 0) > 0 && (
                      <span className="badge badge-danger">Cancelled ×{item.cancelledQty}</span>
                    )}
                    {item.componentsConsumed?.length > 0 && (
                      <span className="badge badge-info" title={item.componentsConsumed.map(c => `${c.qtyPerUnit}× ${c.name}`).join(', ')}>
                        Bundle
                      </span>
                    )}
                  </span>
                  {item.serials?.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#7C3AED', marginTop: '2px' }}>
                      S/N: {item.serials.join(', ')}
                    </div>
                  )}
                  {item.batchesConsumed?.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#0891B2', marginTop: '2px' }}>
                      Batches: {item.batchesConsumed.map(b => `${b.batchNumber} ×${b.quantity}`).join(', ')}
                    </div>
                  )}
                  {item.componentsConsumed?.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      Contains: {item.componentsConsumed.map(c => `${c.qtyPerUnit}× ${c.name}`).join(', ')} (per bundle)
                    </div>
                  )}
                </td>
                <td>{item.product?.sku || item.sku || '-'}</td>
                <td>{item.quantity}</td>
                <td>{formatCurrency(item.price)}</td>
                <td style={{ textAlign: 'right' }}>
                  <strong>{formatCurrency(Number(item.quantity) * Number(item.price))}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="3" style={{ fontWeight: 700, color: '#0F172A' }}>
                Total: {(sale.items || []).length} item{(sale.items || []).length === 1 ? '' : 's'}
              </td>
              <td style={{ fontWeight: 700 }}>
                {(sale.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0)} pcs
              </td>
              <td colSpan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Totals summary */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '320px', backgroundColor: 'var(--background)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>Subtotal:</span>
            <span>{formatCurrency(sale.subtotal || sale.total)}</span>
          </div>
          {Number(sale.totalDiscount || sale.discount || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: '#16A34A' }}>
              <span>Discount:</span>
              <span>-{formatCurrency(sale.totalDiscount || sale.discount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>Tax:</span>
            <span>{formatCurrency(sale.totalTax || sale.tax || 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', borderTop: '2px solid var(--border)', paddingTop: '12px', marginTop: '8px', color: '#16A34A', fontWeight: '700' }}>
            <span>Grand Total:</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>

          {/* Credit breakdown below grand total */}
          {isCredit && (
            <>
              <div style={{ borderTop: '1px dashed var(--border)', marginTop: '12px', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
                  <span>Amount Paid:</span>
                  <span style={{ color: '#16A34A', fontWeight: 600 }}>{formatCurrency(amountPaid)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700 }}>
                  <span>Balance Due:</span>
                  <span style={{ color: balanceDue > 0 ? '#DC2626' : '#16A34A' }}>
                    {formatCurrency(balanceDue)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaleDetail;
