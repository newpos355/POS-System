const mongoose = require('mongoose');
const ReportSchedule = require('../models/ReportSchedule');
const { runSchedule, computeNextRunAt } = require('../services/reportRunner');

const isDbConnected = () => mongoose.connection.readyState === 1;

const REPORT_TYPES = ['receivables', 'payables', 'sales-summary', 'custom'];

const sanitize = (body) => {
  const out = {};
  if (body.name !== undefined) out.name = String(body.name).trim().slice(0, 100);
  if (body.reportType !== undefined) {
    if (!REPORT_TYPES.includes(body.reportType)) {
      throw Object.assign(new Error(`Report type must be one of: ${REPORT_TYPES.join(', ')}.`), { status: 400 });
    }
    out.reportType = body.reportType;
  }
  if (body.config !== undefined) {
    const c = body.config || {};
    out.config = { entity: c.entity, groupBy: c.groupBy, metrics: Array.isArray(c.metrics) ? c.metrics.slice(0, 10) : undefined };
  }
  if (body.frequency !== undefined) {
    if (!['daily', 'weekly', 'monthly'].includes(body.frequency)) {
      throw Object.assign(new Error('Frequency must be daily, weekly, or monthly.'), { status: 400 });
    }
    out.frequency = body.frequency;
  }
  if (body.hour !== undefined) out.hour = Math.min(23, Math.max(0, parseInt(body.hour) || 0));
  if (body.dayOfWeek !== undefined) out.dayOfWeek = Math.min(6, Math.max(0, parseInt(body.dayOfWeek) || 0));
  if (body.dayOfMonth !== undefined) out.dayOfMonth = Math.min(28, Math.max(1, parseInt(body.dayOfMonth) || 1));
  if (body.recipients !== undefined) {
    out.recipients = (Array.isArray(body.recipients) ? body.recipients : String(body.recipients).split(/[,;\s]+/))
      .map((r) => String(r).trim().toLowerCase())
      .filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r))
      .slice(0, 10);
  }
  if (body.isActive !== undefined) out.isActive = Boolean(body.isActive);
  return out;
};

// ─── LIST ─────────────────────────────────────────────────────────────────────
exports.getSchedules = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const schedules = await ReportSchedule.find({ tenantId: req.tenantId })
      .populate('createdBy', 'name')
      .sort('-createdAt');
    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
exports.createSchedule = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const fields = sanitize(req.body);
    if (!fields.name) return res.status(400).json({ success: false, message: 'A name is required.' });
    if (!fields.reportType) return res.status(400).json({ success: false, message: 'A report type is required.' });
    if (fields.reportType === 'custom' && (!fields.config?.entity || !fields.config?.groupBy)) {
      return res.status(400).json({ success: false, message: 'A custom schedule needs its report config (entity and grouping).' });
    }

    const schedule = new ReportSchedule({
      ...fields,
      tenantId: req.tenantId,
      createdBy: req.user._id,
    });
    schedule.nextRunAt = computeNextRunAt(schedule);
    await schedule.save();
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateSchedule = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const fields = sanitize(req.body);
    const schedule = await ReportSchedule.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: fields },
      { new: true, runValidators: true }
    );
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

    // Timing fields changed → recompute the next slot.
    if (fields.frequency !== undefined || fields.hour !== undefined
      || fields.dayOfWeek !== undefined || fields.dayOfMonth !== undefined
      || fields.isActive === true) {
      schedule.nextRunAt = computeNextRunAt(schedule);
      await schedule.save();
    }
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteSchedule = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const schedule = await ReportSchedule.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── RUN NOW ──────────────────────────────────────────────────────────────────
// Generates immediately and attempts the email; the report data also comes
// back in the response so the screen can show it even when email isn't
// configured.
exports.runNow = async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database not available.' });
  try {
    const schedule = await ReportSchedule.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

    const result = await runSchedule(schedule);
    schedule.lastRunAt = new Date();
    schedule.lastStatus = result.status;
    schedule.lastError = result.error || null;
    await schedule.save();

    res.json({
      success: result.status !== 'failed',
      message: result.status === 'sent'
        ? `Report emailed to ${schedule.recipients.join(', ')}.`
        : result.status === 'email_failed'
          ? `Report generated, but email failed: ${result.error}`
          : `Report failed: ${result.error}`,
      data: { schedule, report: result.report || null, status: result.status },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
