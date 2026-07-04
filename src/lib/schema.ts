/**
 * Drizzle ORM Schema — Atlas Eye CRM
 * Espelha exatamente as migrations SQL do Supabase (database/001_init_schema.sql + seguintes)
 * compatível com Neon (PostgreSQL)
 */
import {
  pgTable, pgEnum, uuid, text, boolean, integer, numeric,
  timestamp, jsonb, index, uniqueIndex, foreignKey, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── Enums ────────────────────────────────────────────────────────────────────
export const memberStatusEnum = pgEnum('member_status', ['active', 'invited', 'disabled'])
export const integrationStatusEnum = pgEnum('integration_status', ['active', 'disabled'])
export const leadActivityTypeEnum = pgEnum('lead_activity_type', ['note', 'call', 'whatsapp', 'email', 'system'])
export const customFieldTypeEnum = pgEnum('custom_field_type', ['text', 'number', 'date', 'bool', 'select', 'multi_select', 'json'])

// ── Tiers & Organizations ─────────────────────────────────────────────────────
export const tiers = pgTable('tiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  maxUsers: integer('max_users'),
  canUseCustomFields: boolean('can_use_custom_fields').default(false),
  permissions: jsonb('permissions').default({}),
})

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  tierId: uuid('tier_id').references(() => tiers.id),
  timezone: text('timezone').default('UTC'),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ── Auth & Profiles ───────────────────────────────────────────────────────────
// Substitui auth.users do Supabase — gerenciado pelo NextAuth + bcrypt
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  timezone: text('timezone'),
  isSuperadmin: boolean('is_superadmin').default(false),
})

// Tabela de sessões NextAuth (necessária para estratégia database)
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── RBAC ──────────────────────────────────────────────────────────────────────
export const organizationRoles = pgTable('organization_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  permissions: jsonb('permissions').default({}),
  version: integer('version').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  roleId: uuid('role_id').notNull(),
  status: memberStatusEnum('status').default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ── Pipelines ─────────────────────────────────────────────────────────────────
export const pipelines = pgTable('pipelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id),
  name: text('name').notNull(),
  color: text('color'),
  rank: numeric('rank', { precision: 20, scale: 6 }).notNull(),
  targetVolume: integer('target_volume'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ── Integrations ──────────────────────────────────────────────────────────────
export const integrations = pgTable('integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  type: text('type'),
  config: jsonb('config').default({}),
  status: integrationStatusEnum('status').default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// Segredos das integrações (substitui vault do Supabase)
export const integrationSecrets = pgTable('integration_secrets', {
  id: uuid('id').defaultRandom().primaryKey(),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull(),
  secret: jsonb('secret').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ── Leads ─────────────────────────────────────────────────────────────────────
export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  stageId: uuid('stage_id'),
  integrationId: uuid('integration_id'),
  ownerMemberId: uuid('owner_member_id'),
  title: text('title').notNull(),
  externalId: text('external_id'),
  email: text('email'),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  cpf: text('cpf'),
  cep: text('cep'),
  address: text('address'),
  addressNumber: text('address_number'),
  addressComplement: text('address_complement'),
  neighborhood: text('neighborhood'),
  city: text('city'),
  state: text('state'),
  aiInterestLevel: text('ai_interest_level'),
  aiNextActionShort: text('ai_next_action_short'),
  customAttributes: jsonb('custom_attributes').default({}),
  lastMessageContent: text('last_message_content'),
  lastMessageSenderType: text('last_message_sender_type'),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  lastActivityType: leadActivityTypeEnum('last_activity_type'),
  lastActivityByMemberId: uuid('last_activity_by_member_id'),
  isGroup: boolean('is_group').default(false),
  isUnread: boolean('is_unread').default(false),
  value: numeric('value', { precision: 15, scale: 2 }),
  goals: jsonb('goals').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ── Tags ──────────────────────────────────────────────────────────────────────
export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  color: text('color').default('#6366f1'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const leadTags = pgTable('lead_tags', {
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.leadId, t.tagId] }),
}))

// ── Lead Activities ───────────────────────────────────────────────────────────
export const leadActivities = pgTable('lead_activities', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  actorMemberId: uuid('actor_member_id'),
  type: leadActivityTypeEnum('type').notNull(),
  content: text('content'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ── Custom Fields ─────────────────────────────────────────────────────────────
export const customFieldCategories = pgTable('custom_field_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  rank: numeric('rank', { precision: 20, scale: 6 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  categoryId: uuid('category_id').references(() => customFieldCategories.id),
  name: text('name').notNull(),
  fieldKey: text('field_key').notNull(),
  fieldType: customFieldTypeEnum('field_type').notNull(),
  options: jsonb('options').default([]),
  isRequired: boolean('is_required').default(false),
  rank: numeric('rank', { precision: 20, scale: 6 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ── Lead History ──────────────────────────────────────────────────────────────
export const leadStageHistory = pgTable('lead_stage_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  fromStageId: uuid('from_stage_id'),
  toStageId: uuid('to_stage_id'),
  movedByMemberId: uuid('moved_by_member_id'),
  movedAt: timestamp('moved_at', { withTimezone: true }).defaultNow(),
})

// ── API Tokens ────────────────────────────────────────────────────────────────
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  isActive: boolean('is_active').default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Integration Message Logs (n8n e outros sistemas externos) ────────────────
export const integrationMessageLogs = pgTable('integration_message_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  source: text('source').notNull(),
  direction: text('direction'),
  phone: text('phone'),
  content: text('content'),
  leadId: uuid('lead_id'),
  status: text('status').notNull(),
  error: text('error'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Notifications ─────────────────────────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  recipientMemberId: uuid('recipient_member_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  metadata: jsonb('metadata').default({}),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Setup Tokens (para criação inicial de workspace) ──────────────────────────
export const setupTokens = pgTable('setup_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  token: text('token').notNull().unique(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Webhook Logs ──────────────────────────────────────────────────────────────
export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Funil de Mensagens ────────────────────────────────────────────────────────
export const funnelTriggerEnum = pgEnum('funnel_trigger', ['novo_pago', 'novo_recuperacao', 'geracaowhatsapp', 'pedido_figurinha', 'abandono_preco'])
export const funnelBlockTypeEnum = pgEnum('funnel_block_type', ['trigger', 'message', 'wait', 'condition', 'end'])
export const funnelBranchEnum = pgEnum('funnel_branch', ['default', 'yes', 'no'])
export const funnelExecutionStatusEnum = pgEnum('funnel_execution_status', ['running', 'waiting', 'waiting_condition', 'completed', 'stopped'])

export const messageFunnels = pgTable('message_funnels', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  trigger: funnelTriggerEnum('trigger').notNull(),
  isActive: boolean('is_active').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const funnelBlocks = pgTable('funnel_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  funnelId: uuid('funnel_id').notNull().references(() => messageFunnels.id, { onDelete: 'cascade' }),
  type: funnelBlockTypeEnum('type').notNull(),
  config: jsonb('config').default({}),
  positionX: numeric('position_x', { precision: 10, scale: 2 }).default('0'),
  positionY: numeric('position_y', { precision: 10, scale: 2 }).default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const funnelConnections = pgTable('funnel_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  funnelId: uuid('funnel_id').notNull().references(() => messageFunnels.id, { onDelete: 'cascade' }),
  sourceBlockId: uuid('source_block_id').notNull().references(() => funnelBlocks.id, { onDelete: 'cascade' }),
  targetBlockId: uuid('target_block_id').notNull().references(() => funnelBlocks.id, { onDelete: 'cascade' }),
  branch: funnelBranchEnum('branch').default('default'),
})

export const funnelExecutions = pgTable('funnel_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  funnelId: uuid('funnel_id').notNull().references(() => messageFunnels.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  currentBlockId: uuid('current_block_id'),
  status: funnelExecutionStatusEnum('status').default('running'),
  waitUntil: timestamp('wait_until', { withTimezone: true }),
  context: jsonb('context').default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const funnelClickEvents = pgTable('funnel_click_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  executionId: uuid('execution_id').notNull().references(() => funnelExecutions.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').notNull(),
  token: text('token').notNull().unique(),
  targetUrl: text('target_url').notNull(),
  clicked: boolean('clicked').default(false),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const funnelResponseEvents = pgTable('funnel_response_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  executionId: uuid('execution_id').notNull().references(() => funnelExecutions.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').notNull(),
  branch: funnelBranchEnum('branch').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Produtos ──────────────────────────────────────────────────────────────────
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 15, scale: 2 }).notNull().default('0'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ── Pedidos ───────────────────────────────────────────────────────────────────
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  paymentMethod: text('payment_method').notNull().default('pix'),
  paymentStatus: text('payment_status').notNull().default('pending'),
  deliveryStatus: text('delivery_status').notNull().default('pending'),
  totalValue: numeric('total_value', { precision: 15, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  customerEmail: text('customer_email'),
  customerCpf: text('customer_cpf'),
  customerCep: text('customer_cep'),
  customerAddress: text('customer_address'),
  customerAddressNumber: text('customer_address_number'),
  customerAddressComplement: text('customer_address_complement'),
  customerNeighborhood: text('customer_neighborhood'),
  customerCity: text('customer_city'),
  customerState: text('customer_state'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ── Itens do Pedido ───────────────────────────────────────────────────────────
export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: numeric('unit_price', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Respostas Rápidas ─────────────────────────────────────────────────────────
export const quickReplyScopeEnum = pgEnum('quick_reply_scope', ['shared', 'personal'])

export const quickReplies = pgTable('quick_replies', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  scope: quickReplyScopeEnum('scope').notNull().default('personal'),
  createdByMemberId: uuid('created_by_member_id'),
  shortcut: text('shortcut').notNull(),
  category: text('category'),
  content: text('content').notNull().default(''),
  mediaUrl: text('media_url'),
  mediaType: text('media_type'),
  mediaMimetype: text('media_mimetype'),
  mediaFilename: text('media_filename'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  orgScopeIdx: index('quick_replies_org_scope_idx').on(t.organizationId, t.scope),
  orgMemberIdx: index('quick_replies_org_member_idx').on(t.organizationId, t.createdByMemberId),
  sharedShortcutUnique: uniqueIndex('quick_replies_shared_shortcut_unique')
    .on(t.organizationId, sql`lower(${t.shortcut})`)
    .where(sql`${t.scope} = 'shared' and ${t.deletedAt} is null`),
  personalShortcutUnique: uniqueIndex('quick_replies_personal_shortcut_unique')
    .on(t.organizationId, t.createdByMemberId, sql`lower(${t.shortcut})`)
    .where(sql`${t.scope} = 'personal' and ${t.deletedAt} is null`),
}))

// ── Histórico de Status do Pedido ──────────────────────────────────────────────
export const orderStatusHistory = pgTable('order_status_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedByMemberId: uuid('changed_by_member_id'),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orderIdx: index('order_status_history_order_idx').on(t.orderId, t.changedAt),
}))

// ── Despesas / Contas a Pagar ──────────────────────────────────────────────────
export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  description: text('description').notNull(),
  category: text('category').notNull().default('outros'),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  payee: text('payee'),
  notes: text('notes'),
  isRecurring: boolean('is_recurring').notNull().default(false),
  recurrenceInterval: text('recurrence_interval'),
  recurrenceDay: integer('recurrence_day'),
  recurrenceEndDate: timestamp('recurrence_end_date', { withTimezone: true }),
  parentExpenseId: uuid('parent_expense_id'),
  createdByMemberId: uuid('created_by_member_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  parentExpenseFk: foreignKey({ columns: [t.parentExpenseId], foreignColumns: [t.id] }).onDelete('set null'),
  orgDueDateIdx: index('expenses_org_due_date_idx').on(t.organizationId, t.dueDate),
  orgStatusIdx: index('expenses_org_status_idx').on(t.organizationId, t.status),
  parentDueDateUnique: uniqueIndex('expenses_parent_due_date_unique')
    .on(t.parentExpenseId, t.dueDate)
    .where(sql`${t.parentExpenseId} is not null and ${t.deletedAt} is null`),
}))
