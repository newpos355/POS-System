const mongoose = require('mongoose');
const ReportSchedule = require('../models/ReportSchedule');
const { buildReceivables, buildPayables, buildCustomReport, buildSalesSummary } = require('./reportData');
const { sendMail } = require('../utils/email');

const isDbConnected = () => mongoose.connection.readyState === 1;

// ─── Next occurrence of a schedule's slot, strictly after `from` ─────────────
function computeNextRunAt(schedule, from = new Date()) {
  const next = new Date(from);
  next.setMinutes(0, 0, 0);
  next.setHours(schedule.hour ?? 7);

  if (schedule.frequency === 'daily') {
    if (next <= from) next.setDate(next.getDate() + 1);
  } else if (schedule.frequency === 'weekly') {
    const target = schedule.dayOfWeek ?? 1;
    while (next.getDay() !== target || next <= from) next.setDate(next.getDate() + 1);
  } else { // monthly
    const target = schedule.dayOfMonth ?? 1;
    next.setDate(target);
    if (next <= from) next.setMonth(next.getMonth() + 1, target);
  }
  return next;
}

// The reporting window an emailed run covers: since the last run, or one
// period back for the first run.
function windowFor(schedule, now = new Date()) {
  if (schedule.lastRunAt) return { from: schedule.lastRunAt, to: now };
  const from = new Date(now);
  if (schedule.frequency === 'daily') from.setDate(from.getDate() - 1);
  else if (schedule.frequency === 'weekly') from.setDate(from.getDate() - 7);
  else from.setMonth(from.getMonth() - 1);
  return { from, to: now };
}

// ─── Generate the report data for one schedule ───────────────────────────────
async function generateReport(schedule) {
  const tenantId = schedule.tenantId;
  const win = windowFor(schedule);

  if (schedule.reportType === 'receivables') {
    const data = await buildReceivables(tenantId);
    return {
      title: 'Receivables (money owed to you)',
      columns: ['Customer', 'Current', '1-30d', '31-60d', '61-90d', '90d+', 'Total'],
      rows: data.rows.map((r) => [r.customerName, r.current, r.d30, r.d60, r.d90, r.over90, r.total]),
      footer: ['TOTAL', data.totals.current, data.totals.d30, data.totals.d60, data.totals.d90, data.totals.over90, data.totals.total],
    };
  }
  if (schedule.reportType === 'payables') {
    const data = await buildPayables(tenantId);
    return {
      title: 'Payables (money you owe vendors)',
      columns: ['Vendor', 'Current', '1-30d', '31-60d', '61-90d', '90d+', 'Total'],
      rows: data.rows.map((r) => [r.vendorName, r.current, r.d30, r.d60, r.d90, r.over90, r.total]),
      footer: ['TOTAL', data.totals.current, data.totals.d30, data.totals.d60, data.totals.d90, data.totals.over90, data.totals.total],
    };
  }

  const config = schedule.reportType === 'custom'
    ? { ...(schedule.config || {}), from: win.from, to: win.to }
    : { from: win.from, to: win.to };
  const data = schedule.reportType === 'custom'
    ? await buildCustomReport(tenantId, config)
    : await buildSalesSummary(tenantId, config);

  return {
    title: schedule.reportType === 'custom'
      ? `${data.entity} by ${data.groupBy}`
      : 'Sales summary',
    subtitle: `${new Date(win.from).toLocaleString()} → ${new Date(win.to).toLocaleString()}`,
    columns: ['Group', ...data.metrics],
    rows: data.rows.map((r) => [r.group, ...data.metrics.map((m) => r[m])]),
    footer: ['TOTAL', ...data.metrics.map((m) => data.totals[m])],
  };
}

function renderEmailHTML(schedule, report) {
  const cell = (v, bold) =>
    `<td style="padding:6px 10px;border:1px solid #E2E8F0;${typeof v === 'number' ? 'text-align:right;' : ''}${bold ? 'font-weight:700;background:#F8FAFC;' : ''}">${typeof v === 'number' ? v.toLocaleString() : String(v ?? '')}</td>`;
  const rowsHtml = report.rows.length
    ? report.rows.map((r) => `<tr>${r.map((v) => cell(v)).join('')}</tr>`).join('')
    : `<tr><td colspan="${report.columns.length}" style="padding:14px;text-align:center;color:#94A3B8;border:1px solid #E2E8F0;">No data for this period</td></tr>`;

  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;">
    <div style="background:#16A34A;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0;">
      <div style="font-size:20px;font-weight:800;">${schedule.name}</div>
      <div style="font-size:13px;color:#BBF7D0;">${report.title}${report.subtitle ? ' · ' + report.subtitle : ''}</div>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead><tr>${report.columns.map((c) => cell(c, true)).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
      ${report.footer ? `<tfoot><tr>${report.footer.map((v) => cell(v, true)).join('')}</tr></tfoot>` : ''}
    </table>
    <div style="font-size:11px;color:#94A3B8;padding:10px 0;">Scheduled report from ApexPOS — generated ${new Date().toLocaleString()}.</div>
  </div>`;
}

// ─── Run one schedule now ────────────────────────────────────────────────────
// Returns {status, error?, report}. Used by both the scheduler tick and the
// "Run now" endpoint.
async function runSchedule(schedule) {
  let report;
  try {
    report = await generateReport(schedule);
  } catch (err) {
    return { status: 'failed', error: err.message };
  }

  let status = 'sent';
  let error;
  if (schedule.recipients?.length) {
    try {
      await sendMail(schedule.recipients, `[ApexPOS] ${schedule.name}`, renderEmailHTML(schedule, report));
    } catch (err) {
      status = 'email_failed';
      error = err.message;
    }
  } else {
    status = 'email_failed';
    error = 'No recipients configured.';
  }
  return { status, error, report };
}

// ─── Scheduler loop ──────────────────────────────────────────────────────────
// A light poll every 5 minutes; each due schedule is claimed with a
// conditional update on nextRunAt so two server instances can't both send
// the same run.
const TICK_MS = 5 * 60 * 1000;

async function tick() {
  if (!isDbConnected()) return;
  try {
    const now = new Date();
    const due = await ReportSchedule.find({
      isActive: true,
      nextRunAt: { $lte: now },
    }).limit(20);

    for (const schedule of due) {
      const claimed = await ReportSchedule.findOneAndUpdate(
        { _id: schedule._id, isActive: true, nextRunAt: schedule.nextRunAt },
        { $set: { nextRunAt: computeNextRunAt(schedule, now) } },
        { new: false }
      );
      if (!claimed) continue; // another instance took it

      const result = await runSchedule(schedule);
      await ReportSchedule.updateOne(
        { _id: schedule._id },
        { $set: { lastRunAt: now, lastStatus: result.status, lastError: result.error || null } }
      );
      console.log(`[REPORTS] ${schedule.name}: ${result.status}${result.error ? ' — ' + result.error : ''}`);
    }
  } catch (err) {
    console.error('[REPORTS] scheduler tick error:', err.message);
  }
}

function startReportScheduler() {
  setInterval(tick, TICK_MS);
  // First check shortly after boot so overdue schedules aren't held a full tick.
  setTimeout(tick, 30 * 1000);
  console.log('📬 Scheduled-report runner active (5-minute tick)');
}

module.exports = { startReportScheduler, runSchedule, computeNextRunAt, generateReport };
