import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── Global editable settings (key/value) ────────────────────────────
export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
})

// ─── Teams ───────────────────────────────────────────────────────────
export const teams = sqliteTable('teams', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  code: text().notNull().unique(), // 6-char alphanumeric access code
  balance: integer().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`(unixepoch())`,
  ),
})

// ─── Companies ───────────────────────────────────────────────────────
export const companies = sqliteTable('companies', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  description: text().notNull().default(''),
  multiplier: integer().notNull(), // current multiplier, e.g. 2 == "2x"
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`(unixepoch())`,
  ),
})

// ─── Rounds ─────────────────────────────────────────────────────────
// status: draft -> open -> closed -> resolved
export const rounds = sqliteTable('rounds', {
  id: integer().primaryKey({ autoIncrement: true }),
  number: integer().notNull().unique(),
  scenario: text().notNull().default(''),
  status: text().notNull().default('draft'), // 'draft'|'open'|'closed'|'resolved'
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`(unixepoch())`,
  ),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
})

// ─── Per-company outcome for each round ──────────────────────────────
export const roundOutcomes = sqliteTable(
  'round_outcomes',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    roundId: integer('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id),
    outcome: text().notNull(), // 'tank' | 'gain' | 'hold'
    multiplierOverride: integer('multiplier_override'), // optional manual next-multiplier
  },
  (t) => [uniqueIndex('round_outcomes_round_company').on(t.roundId, t.companyId)],
)

// ─── Investments ─────────────────────────────────────────────────────
export const investments = sqliteTable('investments', {
  id: integer().primaryKey({ autoIncrement: true }),
  roundId: integer('round_id')
    .notNull()
    .references(() => rounds.id, { onDelete: 'cascade' }),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  amount: integer().notNull(),
  // snapshot of the company multiplier at investment time (auditing)
  multiplierAtInvestment: integer('multiplier_at_investment').notNull(),
  returnAmount: integer('return_amount'), // set when the round resolves
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`(unixepoch())`,
  ),
})

// ─── Auth sessions (admin + team) ────────────────────────────────────
export const sessions = sqliteTable('sessions', {
  token: text().primaryKey(),
  kind: text().notNull(), // 'admin' | 'team'
  teamId: integer('team_id').references(() => teams.id, {
    onDelete: 'cascade',
  }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`(unixepoch())`,
  ),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
})
