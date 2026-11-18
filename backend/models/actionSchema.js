const mongoose = require('mongoose');

// One automation action, shared by Workflow rules and Custom Functions.
// Executed by services/automationEngine.executeActions. Config shape per type:
//   email        — { to: 'custom'|'customer', recipients: [String],
//                    templateId: ObjectId|null, subject: String, body: String }
//                  (templateId wins over inline subject/body when set)
//   webhook      — { webhookId: ObjectId } (references a configured Webhook,
//                    so the URL, secret and delivery log live in one place)
//   notification — { title: String, message: String, priority: String }
//   update_field — { field: String, value: Mixed } — restricted server-side
//                  to `notes` and `customFields.*` on the triggering record
//                  so automations can never corrupt financial/stock fields.
const actionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['email', 'webhook', 'notification', 'update_field'],
    required: true,
  },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

module.exports = actionSchema;
