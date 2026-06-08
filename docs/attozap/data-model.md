# Modelo de dados ATTOZAP

## 1. Estratégia de persistência

A ATTOZAP deve iniciar com SQLite otimizado, mas todos os modelos devem ser criados com compatibilidade PostgreSQL. Isso significa:

- Usar UUID ou CUID como identificador externo.
- Evitar tipos exclusivos de SQLite na camada de domínio.
- Centralizar migrations em ORM compatível com PostgreSQL.
- Criar índices compostos por `company_id` e campos de busca.
- Separar eventos/auditoria de tabelas transacionais.

## 2. Entidades de tenancy e identidade

### `owners`

Representa administradores globais da plataforma.

Campos principais:

- `id`.
- `name`.
- `email`.
- `status`.
- `created_at`.
- `updated_at`.

### `companies`

Representa cada empresa cliente do SaaS.

Campos principais:

- `id`.
- `name`.
- `legal_name`.
- `document`.
- `slug`.
- `plan_id`.
- `status`.
- `settings_json`.
- `created_at`.
- `updated_at`.

### `users`

Usuários pertencentes a uma empresa.

Campos principais:

- `id`.
- `company_id`.
- `name`.
- `email`.
- `phone`.
- `password_hash` ou referência ao provedor de autenticação.
- `role`.
- `manager_id`.
- `team_id`.
- `status`.
- `created_at`.
- `updated_at`.

Papéis suportados:

- `company_admin`.
- `director`.
- `superintendent`.
- `manager`.
- `broker`.

### `teams`

Agrupa corretores sob gerentes e superintendentes.

Campos principais:

- `id`.
- `company_id`.
- `name`.
- `manager_id`.
- `superintendent_id`.
- `status`.

## 3. CRM

### `pipelines`

Campos principais:

- `id`.
- `company_id`.
- `name`.
- `is_default`.
- `status`.

### `pipeline_stages`

Campos principais:

- `id`.
- `company_id`.
- `pipeline_id`.
- `name`.
- `position`.
- `stage_type`.
- `color`.
- `is_won_stage`.
- `is_lost_stage`.

Etapas padrão:

- Oferta Ativa.
- Conversando.
- Agendado.
- Visitou.
- Proposta.
- Venda.
- Perdido.
- Descartado.

### `leads`

Campos principais:

- `id`.
- `company_id`.
- `pipeline_id`.
- `stage_id`.
- `assigned_user_id`.
- `name`.
- `phone`.
- `cpf`.
- `origin`.
- `status`.
- `last_interaction_at`.
- `created_at`.
- `updated_at`.

Índices recomendados:

- `(company_id, assigned_user_id, status)`.
- `(company_id, pipeline_id, stage_id)`.
- `(company_id, phone)`.
- `(company_id, cpf)`.
- `(company_id, last_interaction_at)`.

### `lead_notes`

Campos principais:

- `id`.
- `company_id`.
- `lead_id`.
- `user_id`.
- `body`.
- `created_at`.

### `tags` e `lead_tags`

Permitem segmentação, automações e campanhas.

### `lead_events`

Histórico completo e auditável do lead.

Campos principais:

- `id`.
- `company_id`.
- `lead_id`.
- `actor_user_id`.
- `event_type`.
- `payload_json`.
- `created_at`.

## 4. WhatsApp

### `whatsapp_connections`

Campos principais:

- `id`.
- `company_id`.
- `name`.
- `phone_number`.
- `status`.
- `pm2_process_name`.
- `session_path`.
- `last_qr_code`.
- `last_heartbeat_at`.
- `connected_at`.
- `disconnected_at`.
- `messages_sent_count`.
- `messages_received_count`.
- `health_score`.
- `created_at`.
- `updated_at`.

### `whatsapp_messages`

Campos principais:

- `id`.
- `company_id`.
- `connection_id`.
- `lead_id`.
- `direction`.
- `message_type`.
- `remote_jid`.
- `body`.
- `media_url`.
- `provider_message_id`.
- `status`.
- `sent_at`.
- `received_at`.
- `created_at`.

### `campaigns`

Campos principais:

- `id`.
- `company_id`.
- `name`.
- `connection_id`.
- `status`.
- `scheduled_at`.
- `started_at`.
- `finished_at`.
- `created_by_user_id`.
- `message_template`.
- `filters_json`.

### `campaign_recipients`

Campos principais:

- `id`.
- `company_id`.
- `campaign_id`.
- `lead_id`.
- `phone`.
- `status`.
- `attempts`.
- `last_error`.
- `sent_at`.

## 5. Automações

### `automation_flows`

Campos principais:

- `id`.
- `company_id`.
- `name`.
- `status`.
- `trigger_type`.
- `version`.
- `graph_json`.
- `created_by_user_id`.

### `automation_runs`

Campos principais:

- `id`.
- `company_id`.
- `flow_id`.
- `status`.
- `trigger_event_id`.
- `context_json`.
- `started_at`.
- `finished_at`.

### `automation_run_steps`

Campos principais:

- `id`.
- `company_id`.
- `run_id`.
- `node_id`.
- `status`.
- `input_json`.
- `output_json`.
- `error`.
- `started_at`.
- `finished_at`.

## 6. Consulta CPF

### `cpf_lookup_settings`

Campos principais:

- `id`.
- `company_id`.
- `cpf_group_jid`.
- `warmup_group_jid`.
- `default_connection_id`.
- `timeout_seconds`.

### `cpf_lookup_requests`

Campos principais:

- `id`.
- `company_id`.
- `lead_id`.
- `requested_by_user_id`.
- `cpf`.
- `status`.
- `request_message_id`.
- `response_text`.
- `response_media_url`.
- `requested_at`.
- `completed_at`.

## 7. Aquecimento

### `warmup_rules`

Campos principais:

- `id`.
- `company_id`.
- `name`.
- `status`.
- `connection_ids_json`.
- `daily_limit_per_connection`.
- `time_window_json`.
- `use_ai_variations`.

### `warmup_messages`

Campos principais:

- `id`.
- `company_id`.
- `category`.
- `body`.
- `status`.

### `warmup_runs`

Campos principais:

- `id`.
- `company_id`.
- `rule_id`.
- `status`.
- `started_at`.
- `finished_at`.

## 8. Metas e gamificação

### `goals`

Campos principais:

- `id`.
- `company_id`.
- `scope_type`.
- `scope_id`.
- `metric`.
- `target_value`.
- `period_type`.
- `starts_at`.
- `ends_at`.
- `status`.

### `score_events`

Campos principais:

- `id`.
- `company_id`.
- `user_id`.
- `event_type`.
- `points`.
- `source_type`.
- `source_id`.
- `created_at`.

### `rewards`

Campos principais:

- `id`.
- `company_id`.
- `name`.
- `description`.
- `points_cost`.
- `stock`.
- `status`.

### `reward_redemptions`

Campos principais:

- `id`.
- `company_id`.
- `user_id`.
- `reward_id`.
- `points_cost`.
- `status`.
- `created_at`.

## 9. Relatórios e auditoria

### `report_exports`

Campos principais:

- `id`.
- `company_id`.
- `requested_by_user_id`.
- `report_type`.
- `format`.
- `filters_json`.
- `status`.
- `file_url`.
- `created_at`.
- `completed_at`.

### `audit_logs`

Campos principais:

- `id`.
- `company_id`.
- `actor_user_id`.
- `actor_owner_id`.
- `action`.
- `entity_type`.
- `entity_id`.
- `ip_address`.
- `user_agent`.
- `payload_json`.
- `created_at`.

## 10. Regras de isolamento de dados

Toda tabela operacional deve possuir `company_id`, exceto tabelas globais como `plans`, `owners` e configurações de plataforma.

Toda query de API deve derivar `company_id` do token/sessão, nunca do payload enviado pelo cliente. O payload pode selecionar escopos inferiores, como equipe ou corretor, mas não pode trocar o tenant ativo sem autorização.

## 11. Eventos canônicos

Eventos usados por automação, metas, gamificação e relatórios:

- `lead.created`.
- `lead.assigned`.
- `lead.stage_moved`.
- `lead.won`.
- `lead.lost`.
- `whatsapp.message_sent`.
- `whatsapp.message_received`.
- `campaign.started`.
- `campaign.paused`.
- `campaign.completed`.
- `cpf.lookup_requested`.
- `cpf.lookup_completed`.
- `goal.reached`.
- `reward.redeemed`.
