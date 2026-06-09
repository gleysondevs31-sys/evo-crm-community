const schema = {
  companies: ['id', 'organization_id', 'name', 'slug', 'document', 'plan_id', 'status', 'settings', 'created_at', 'updated_at'],
  users: ['id', 'company_id', 'name', 'email', 'password_hash', 'status', 'created_at'],
  roles: ['id', 'company_id', 'name', 'level', 'created_at'],
  permissions: ['id', 'key', 'description'],
  memberships: ['id', 'company_id', 'user_id', 'role_id', 'manager_id', 'created_at'],

  whatsapp_connections: ['id', 'company_id', 'name', 'phone_number', 'status', 'qr_code', 'connected_at', 'last_heartbeat_at', 'messages_sent', 'messages_received', 'total_failures', 'daily_limit', 'hourly_limit', 'delay_min_ms', 'delay_max_ms', 'sent_today', 'sent_this_hour', 'health_score', 'session_path', 'created_at', 'updated_at'],
  contact_lists: ['id', 'company_id', 'name', 'source', 'total_contacts', 'valid_contacts', 'invalid_contacts', 'duplicate_contacts', 'created_at', 'updated_at'],
  contacts: ['id', 'company_id', 'list_id', 'name', 'phone', 'raw_phone', 'tags', 'custom_fields', 'origin', 'status', 'validation_error', 'created_at', 'updated_at'],
  message_templates: ['id', 'company_id', 'name', 'body', 'media_url', 'variables', 'created_at', 'updated_at'],
  campaigns: ['id', 'company_id', 'connection_id', 'contact_list_id', 'name', 'message', 'media_url', 'status', 'total_contacts', 'total_sent', 'total_delivered', 'total_failures', 'total_pending', 'scheduled_at', 'started_at', 'finished_at', 'created_at', 'updated_at'],
  campaign_contacts: ['id', 'company_id', 'campaign_id', 'contact_id', 'status', 'created_at', 'updated_at'],
  message_jobs: ['id', 'company_id', 'campaign_id', 'contact_id', 'connection_id', 'message', 'media_url', 'attempt', 'max_attempts', 'status', 'scheduled_at', 'idempotency_key', 'queue_job_id', 'provider_message_id', 'error', 'sent_at', 'created_at', 'updated_at'],
  message_logs: ['id', 'company_id', 'type', 'campaign_id', 'connection_id', 'message_job_id', 'contact_id', 'message', 'status', 'error', 'metadata', 'created_at'],
  audit_logs: ['id', 'company_id', 'actor_id', 'action', 'entity_type', 'entity_id', 'payload', 'created_at'],

  leads: ['id', 'company_id', 'contact_id', 'pipeline_id', 'stage_id', 'assigned_user_id', 'name', 'phone', 'cpf', 'origin', 'score', 'created_at'],
  conversations: ['id', 'company_id', 'channel', 'lead_id', 'assigned_user_id', 'status', 'last_message_at'],
  messages: ['id', 'company_id', 'conversation_id', 'direction', 'body', 'status', 'provider_message_id', 'created_at'],
  automations: ['id', 'company_id', 'name', 'trigger_type', 'graph_json', 'status'],
  automation_runs: ['id', 'company_id', 'automation_id', 'status', 'context_json', 'started_at', 'finished_at'],
  ai_requests: ['id', 'company_id', 'user_id', 'lead_id', 'provider', 'tokens', 'cost', 'created_at'],
  reports: ['id', 'company_id', 'type', 'filters', 'file_url', 'status'],
  settings: ['id', 'company_id', 'key', 'value'],
};

const sensitiveTables = Object.fromEntries(
  Object.entries(schema)
    .filter(([, columns]) => columns.includes('company_id'))
    .map(([table]) => [table, { tenantKey: 'company_id', indexes: [`idx_${table}_company_id`] }]),
);

module.exports = { schema, sensitiveTables };
