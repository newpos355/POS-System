import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiPlay } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ReportSchedulesAPI } from '../../services/api';
import { BUILDER_OPTIONS } from './CustomReportBuilder';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STATUS_BADGE = {
  sent: <span className="badge badge-success">Sent</span>,
  email_failed: <span className="badge badge-warning">Email failed</span>,
  failed: <span className="badge badge-danger">Failed</span>,
};

// Recurring report emails. The runner polls every 5 minutes server-side;
// "Run now" generates immediately regardless of the schedule.
const ScheduledReports = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [runningId, setRunningId] = useState(null);

  const fetchSchedules = () => {
    ReportSchedulesAPI.getSchedules()
      .then(res => { if (res.data?.success) setSchedules(res.data.data || []); })
      .catch(() => toast.error('Failed to load schedules'))
      .finally(() => setLoading(false));
  };

  useEffect(fetchSchedules, []);

  const handleRun = async (s) => {
    setRunningId(s._id);
    try {
      const res = await ReportSchedulesAPI.runNow(s._id);
      if (res.data?.data?.status === 'sent') toast.success(res.data.message);
      else toast(res.data?.message || 'Run finished', { icon: '⚠️', duration: 6000 });
      fetchSchedules();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Run failed');
    } finally {
      setRunningId(null);
    }
  };

  const handleToggle = async (s) => {
    try {
      await ReportSchedulesAPI.updateSchedule(s._id, { isActive: !s.isActive });
      fetchSchedules();
    } catch (error) {
      toast.error('Failed to update schedule');
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete schedule "${s.name}"?`)) return;
    try {
      await ReportSchedulesAPI.deleteSchedule(s._id);
      toast.success('Schedule deleted');
      fetchSchedules();
    } catch (error) {
      toast.error('Failed to delete schedule');
    }
  };

  const cadence = (s) => {
    if (s.frequency === 'daily') return `Daily at ${String(s.hour).padStart(2, '0')}:00`;
    if (s.frequency === 'weekly') return `${DOW[s.dayOfWeek]}s at ${String(s.hour).padStart(2, '0')}:00`;
    return `Monthly on day ${s.dayOfMonth} at ${String(s.hour).padStart(2, '0')}:00`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <p style={{ color: '#64748B', fontSize: '13px', margin: 0, flex: 1, minWidth: '260px' }}>
          Reports emailed automatically on a schedule — "Run now" always generates immediately and shows the email outcome.
        </p>
        <button className="btn btn-primary" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => setShowForm(true)}>
          <FiPlus /> New Schedule
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Loading…</div>
      ) : schedules.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
          No scheduled reports yet. Create one — e.g. "Receivables every Monday 7am to the accountant."
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Report</th>
                <th>Cadence</th>
                <th>Recipients</th>
                <th>Next Run</th>
                <th>Last Run</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s._id} style={{ opacity: s.isActive ? 1 : 0.55 }}>
                  <td><strong>{s.name}</strong></td>
                  <td>
                    <span className="badge badge-default" style={{ textTransform: 'capitalize' }}>
                      {s.reportType === 'custom'
                        ? `${s.config?.entity || '?'} by ${s.config?.groupBy || '?'}`
                        : s.reportType.replace('-', ' ')}
                    </span>
                  </td>
                  <td>{cadence(s)}</td>
                  <td style={{ fontSize: '12px' }}>{(s.recipients || []).join(', ') || <span style={{ color: '#DC2626' }}>none</span>}</td>
                  <td style={{ fontSize: '12px' }}>{s.isActive && s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '—'}</td>
                  <td style={{ fontSize: '12px' }}>
                    {s.lastRunAt ? (
                      <>
                        {new Date(s.lastRunAt).toLocaleString()}<br />
                        {STATUS_BADGE[s.lastStatus] || null}
                        {s.lastError && <span style={{ color: '#94A3B8', display: 'block' }} title={s.lastError}>{s.lastError.slice(0, 40)}…</span>}
                      </>
                    ) : 'Never'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" disabled={runningId === s._id} onClick={() => handleRun(s)}>
                        <FiPlay /> {runningId === s._id ? 'Running…' : 'Run now'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => handleToggle(s)}>
                        {s.isActive ? 'Pause' : 'Resume'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}>
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <ScheduleForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); fetchSchedules(); }}
        />
      )}
    </div>
  );
};

const ScheduleForm = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({
    name: '', reportType: 'receivables', frequency: 'weekly',
    hour: 7, dayOfWeek: 1, dayOfMonth: 1, recipients: '',
    config: { entity: 'sales', groupBy: 'day', metrics: ['count', 'total'] },
  });
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Give the schedule a name');
    setSaving(true);
    try {
      const res = await ReportSchedulesAPI.createSchedule({
        ...form,
        recipients: form.recipients,
        config: form.reportType === 'custom' ? form.config : undefined,
      });
      if (res.data?.success) {
        toast.success(`Schedule created — next run ${new Date(res.data.data.nextRunAt).toLocaleString()}`);
        onSuccess();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  };

  const opts = BUILDER_OPTIONS[form.config.entity];

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ marginBottom: '16px' }}>New Scheduled Report</h2>
        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Name *</label>
            <input className="form-input" required value={form.name}
              placeholder='e.g. "Weekly receivables for accounting"'
              onChange={e => set({ name: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">Report</label>
              <select className="form-select" value={form.reportType} onChange={e => set({ reportType: e.target.value })}>
                <option value="receivables">Receivables (aged)</option>
                <option value="payables">Payables (aged)</option>
                <option value="sales-summary">Sales summary</option>
                <option value="custom">Custom report</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Frequency</label>
              <select className="form-select" value={form.frequency} onChange={e => set({ frequency: e.target.value })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {form.reportType === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px', background: '#F8FAFC', padding: '10px', borderRadius: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '12px' }}>Entity</label>
                <select className="form-select" value={form.config.entity}
                  onChange={e => {
                    const entity = e.target.value;
                    const o = BUILDER_OPTIONS[entity];
                    set({ config: { entity, groupBy: Object.keys(o.groups)[0], metrics: Object.keys(o.metrics).slice(0, 2) } });
                  }}>
                  {Object.entries(BUILDER_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '12px' }}>Grouped by</label>
                <select className="form-select" value={form.config.groupBy}
                  onChange={e => set({ config: { ...form.config, groupBy: e.target.value } })}>
                  {Object.entries(opts.groups).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">At hour (0–23)</label>
              <input className="form-input" type="number" min="0" max="23" value={form.hour}
                onChange={e => set({ hour: e.target.value })} />
            </div>
            {form.frequency === 'weekly' && (
              <div className="form-group">
                <label className="form-label">On</label>
                <select className="form-select" value={form.dayOfWeek} onChange={e => set({ dayOfWeek: Number(e.target.value) })}>
                  {DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <div className="form-group">
                <label className="form-label">Day of month (1–28)</label>
                <input className="form-input" type="number" min="1" max="28" value={form.dayOfMonth}
                  onChange={e => set({ dayOfMonth: e.target.value })} />
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Email recipients (comma-separated)</label>
            <input className="form-input" placeholder="accounts@business.com, owner@business.com"
              value={form.recipients} onChange={e => set({ recipients: e.target.value })} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduledReports;
