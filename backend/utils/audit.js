const AuditLog = require('../models/AuditLog');

// Fire-and-forget tenant activity logging. Deliberately never awaited by
// callers and never throws — an audit-trail hiccup must not fail the actual
// business operation it describes. Read back via GET /api/reports/activity-log.
function logActivity({ tenantId, userId, action, entity, entityId, description }) {
  AuditLog.create({
    tenantId,
    userId,
    action,
    entity,
    entityId,
    description,
  }).catch((err) => {
    console.error('[AUDIT] write failed:', err.message);
  });
}

module.exports = { logActivity };
