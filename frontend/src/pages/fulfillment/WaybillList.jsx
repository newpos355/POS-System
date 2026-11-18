import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiFilter, FiPrinter, FiXCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { WaybillsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { printWaybill } from './fulfillmentPrint';
import { useAuth } from '../../contexts/AuthContext';
import FulfillmentTabs from './FulfillmentTabs';

const STATUS_BADGE = {
  draft: <span className="badge badge-default">Draft</span>,
  active: <span className="badge badge-success">Active</span>,
  cancelled: <span className="badge badge-danger">Cancelled</span>,
};

const WaybillList = () => {
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const [waybills, setWaybills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchWaybills();
  }, [statusFilter]);

  const fetchWaybills = async () => {
    try {
      setLoading(true);
      const res = await WaybillsAPI.getWaybills(statusFilter ? { status: statusFilter } : {});
      if (res.data?.success) setWaybills(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load waybills');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (wb) => {
    let qrDataUrl = null;
    try {
      const QRCode = (await import('qrcode')).default;
      qrDataUrl = await QRCode.toDataURL(
        JSON.stringify({ wb: wb.waybillNumber, from: wb.consignor?.name, to: wb.consignee?.name, value: wb.totalValue }),
        { width: 192, margin: 1 }
      );
    } catch { /* QR is optional on the printout */ }
    printWaybill(wb, { currencyFormat: formatCurrency, qrDataUrl });
  };

  const handleCancel = async (wb) => {
    const reason = window.prompt(`Cancel waybill ${wb.waybillNumber}? Enter a reason:`);
    if (reason === null) return;
    try {
      const res = await WaybillsAPI.cancelWaybill(wb._id, { reason });
      if (res.data?.success) {
        toast.success('Waybill cancelled');
        fetchWaybills();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel waybill');
    }
  };

  return (
    <div className="page-container">
      <FulfillmentTabs />
      <div className="page-header">
        <div>
          <h1 className="page-title">Waybills</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
            Printable transport documents, issued from a shipment ("Generate Waybill"). Internal documents — not government e-way-bill filings.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiFilter style={{ color: '#64748B' }} />
          <select
            className="form-select"
            style={{ width: '200px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading waybills...</div>
        ) : waybills.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            No waybills yet. Open a shipment and click "Generate Waybill".
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Waybill</th>
                <th>Shipment</th>
                <th>Consignor</th>
                <th>Consignee</th>
                <th>Transporter</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {waybills.map(wb => (
                <tr key={wb._id}>
                  <td><strong>{wb.waybillNumber}</strong></td>
                  <td>
                    {wb.shipmentId
                      ? <Link to={`/shipments/${wb.shipmentId._id || wb.shipmentId}`}>{wb.shipmentId.shipmentNumber || 'View'}</Link>
                      : '-'}
                  </td>
                  <td>{wb.consignor?.name || '-'}</td>
                  <td>{wb.consignee?.name || '-'}</td>
                  <td>{wb.transporter?.name || '-'} {wb.transporter?.vehicleNumber ? `(${wb.transporter.vehicleNumber})` : ''}</td>
                  <td style={{ textAlign: 'right' }}><strong>{formatCurrency(wb.totalValue || 0)}</strong></td>
                  <td>{STATUS_BADGE[wb.status] || wb.status}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => handlePrint(wb)}>
                        <FiPrinter /> Print
                      </button>
                      {isAdmin && wb.status !== 'cancelled' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleCancel(wb)}>
                          <FiXCircle />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default WaybillList;
