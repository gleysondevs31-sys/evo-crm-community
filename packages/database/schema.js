const schema = {
  users: ['id', 'company_id', 'name', 'email', 'password_hash', 'status', 'created_at'],
  companies: ['id', 'organization_id', 'name', 'slug', 'document', 'plan_id', 'status', 'settings', 'created_at'],
  organizations: ['id', 'name', 'owner_id', 'created_at'],
  roles: ['id', 'company_id', 'name', 'level', 'created_at'],
  permissions: ['id', 'key', 'description'],
  memberships: ['id', 'company_id', 'user_id', 'role_id', 'manager_id', 'created_at'],
  leads: ['id', 'company_id', 'contact_id', 'pipeline_id', 'stage_id', 'assigned_user_id', 'name', 'phone', 'cpf', 'origin', 'score', 'created_at'],
  contacts: ['id', 'company_id', 'name', 'email', 'phone', 'document', 'created_at'],
  deals: ['id', 'company_id', 'lead_id', 'value', 'stage_id', 'status', 'expected_close_at'],
  pipelines: ['id', 'company_id', 'name', 'status'],
  pipeline_stages: ['id', 'company_id', 'pipeline_id', 'name', 'position', 'type'],
  conversations: ['id', 'company_id', 'channel', 'lead_id', 'assigned_user_id', 'status', 'last_message_at'],
  messages: ['id', 'company_id', 'conversation_id', 'direction', 'body', 'status', 'provider_message_id', 'created_at'],
  whatsapp_sessions: ['id', 'company_id', 'name', 'phone_number', 'status', 'session_path', 'health_score', 'created_at'],
  campaigns: ['id', 'company_id', 'name', 'channel', 'status', 'scheduled_at', 'created_by'],
  campaign_messages: ['id', 'company_id', 'campaign_id', 'lead_id', 'status', 'sent_at', 'error'],
  automations: ['id', 'company_id', 'name', 'trigger_type', 'graph_json', 'status'],
  automation_runs: ['id', 'company_id', 'automation_id', 'status', 'context_json', 'started_at', 'finished_at'],
  ai_providers: ['id', 'company_id', 'provider', 'model', 'enabled', 'cost_policy'],
  ai_requests: ['id', 'company_id', 'user_id', 'lead_id', 'provider', 'tokens', 'cost', 'created_at'],
  knowledge_documents: ['id', 'company_id', 'title', 'source', 'content', 'status', 'created_at'],
  embeddings: ['id', 'company_id', 'document_id', 'chunk', 'vector', 'created_at'],
  reports: ['id', 'company_id', 'type', 'filters', 'file_url', 'status'],
  goals: ['id', 'company_id', 'scope_type', 'scope_id', 'metric', 'target', 'period'],
  rankings: ['id', 'company_id', 'period', 'user_id', 'points'],
  rewards: ['id', 'company_id', 'name', 'points_cost', 'stock', 'status'],
  audit_logs: ['id', 'company_id', 'actor_id', 'action', 'entity_type', 'entity_id', 'payload', 'created_at'],
  api_keys: ['id', 'company_id', 'name', 'key_hash', 'scopes', 'last_used_at'],
  webhooks: ['id', 'company_id', 'url', 'events', 'secret', 'status'],
  subscriptions: ['id', 'company_id', 'plan_id', 'status', 'current_period_end'],
  invoices: ['id', 'company_id', 'subscription_id', 'amount', 'status', 'due_at'],
  plans: ['id', 'name', 'price', 'limits', 'features'],
  notifications: ['id', 'company_id', 'user_id', 'title', 'body', 'read_at'],
  files: ['id', 'company_id', 'name', 'mime_type', 'size', 'storage_key'],
  settings: ['id', 'company_id', 'key', 'value'],
};

const sensitiveTables = Object.fromEntries(
  Object.entries(schema)
    .filter(([, columns]) => columns.includes('company_id'))
    .map(([table]) => [table, { tenantKey: 'company_id', indexes: [`idx_${table}_company_id`] }]),
);

module.exports = { schema, sensitiveTables };
