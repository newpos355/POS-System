import React, { useState } from 'react';
import { FiPlay, FiDownload } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ExtendedReportsAPI } from '../../services/api';
import { formatCurrency } from '../../utils/currency';

// Pick an entity, a grouping, metrics, and a date range — the server runs a
// whitelisted aggregation and returns rows. Money metrics format as currency.
export const BUILDER_OPTIONS = {
  sales: {
    label: 'Sales',
    groups: { day: 'Day', week: 'Week', month: 'Month', customer: 'Customer', paymentMethod: 'Payment Method', cashier: 'Cashier', product: 'Product' },
    metrics: { count: 'Count', total: 'Revenue', tax: 'Tax', discount: 'Discount' },
  },
  returns: {
    label: 'Returns',
    groups: { day: 'Day', month: 'Month', customer: 'Customer', reason: 'Reason', refundMethod: 'Refund Method' },
    metrics: { count: 'Count', total: 'Refund Total' },
  },
  purchases: {
    label: 'Purchases',
    groups: { day: 'Day', month: 'Month', vendor: 'Vendor', status: 'Status' },
    metrics: { count: 'Count', total: 'PO Total', paid: 'Paid', outstanding: 'Outstanding' },
  },
  expenses: {
    label: 'Expenses',
    groups: { day: 'Day', month: 'Month', category: 'Category' },
    metrics: { count: 'Count', total: 'Total' },
  },
};

const MONEY_METRICS = ['total', 'tax', 'discount', 'paid', 'outstanding'];

const CustomReportBuilder = () => {
  const [entity, setEntity] = useState('sales');
  const [groupBy, setGroupBy] = useState('day');
  const [metrics, setMetrics] = useState(['count', 'total']);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const opts = BUILDER_OPTIONS[entity];

  const changeEntity = (e) => {
    const next = e.target.value;
    setEntity(next);
    const nextOpts = BUILDER_OPTIONS[next];
    if (!nextOpts.groups[groupBy]) setGroupBy(Object.keys(nextOpts.groups)[0]);
    setMetrics(m => {
      const kept = m.filter(x => nextOpts.metrics[x]);
      return kept.length ? kept : Object.keys(nextOpts.metrics).slice(0, 2);
    });
    setResult(null);
  };

  const toggleMetric = (m) => {
    setMetrics(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const run = async () => {
    if (metrics.length === 0) return toast.error('Pick at least one metric');
    setRunning(true);
    try {
      const res = await ExtendedReportsAPI.runCustomReport({ entity, groupBy, metrics, from, to });
      if (res.data?.success) setResult(res.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Report failed');
    } finally {
      setRunning(false);
    }
  };

  const exportCSV = () => {
    if (!result?.rows?.length) return toast.error('Run the report first');
    const head = ['Group', ...result.metrics];
    const lines = result.rows.map(r => [r.group, ...result.metrics.map(m => r[m])]);
    const csv = [head.join(','), ...lines.map(l => l.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${entity}-by-${groupBy}.csv`; a.click();
  };

  const fmt = (m, v) => MONEY_METRICS.includes(m) ? formatCurrency(v || 0) : (v ?? 0).toLocaleString();

  return (
    <div>
      <div className="card" style={{ padding: '16px', marginBottom: '18px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '12px' }}>Report on</label>
          <select className="form-select" style={{ width: '150px' }} value={entity} onChange={changeEntity}>
            {Object.entries(BUILDER_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '12px' }}>Grouped by</label>
          <select className="form-select" style={{ width: '160px' }} value={groupBy} onChange={e => { setGroupBy(e.target.value); setResult(null); }}>
            {Object.entries(opts.groups).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '12px' }}>From</label>
          <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '12px' }}>To</label>
          <input className="form-input" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '12px' }}>Metrics</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(opts.metrics).map(([k, v]) => (
              <button key={k} type="button"
                className={`btn btn-sm ${metrics.includes(k) ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => toggleMetric(k)}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={running}>
          <FiPlay /> {running ? 'Running…' : 'Run Report'}
        </button>
        {result && (
          <button className="btn btn-outline" onClick={exportCSV}><FiDownload /> CSV</button>
        )}
      </div>

      {result && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{opts.groups[result.groupBy] || result.groupBy}</th>
                {result.metrics.map(m => <th key={m} style={{ textAlign: 'right' }}>{opts.metrics[m] || m}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 ? (
                <tr><td colSpan={1 + result.metrics.length} style={{ textAlign: 'center', color: '#64748B', padding: '30px' }}>No data in this range.</td></tr>
              ) : result.rows.map((r, i) => (
                <tr key={i}>
                  <td><strong>{r.group}</strong></td>
                  {result.metrics.map(m => <td key={m} style={{ textAlign: 'right' }}>{fmt(m, r[m])}</td>)}
                </tr>
              ))}
            </tbody>
            {result.rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#F8FAFC', fontWeight: 700 }}>
                  <td>TOTAL ({result.rows.length} group(s))</td>
                  {result.metrics.map(m => <td key={m} style={{ textAlign: 'right' }}>{fmt(m, result.totals[m])}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default CustomReportBuilder;
