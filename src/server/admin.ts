import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  companies,
  investments,
  roundOutcomes,
  rounds,
  teams,
} from '#/db/schema'
import {
  computeReturn,
  generateTeamCode,
  isOutcome,
  nextMultiplier,
} from '#/lib/game'
import { getSettings, saveSettings } from './settings'
import {
  createSession,
  destroySession,
  getSession,
  requireAdmin,
} from './session'

const DEFAULT_ADMIN_PASSWORD = 'admin123'
function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
}

// ─── Login ───────────────────────────────────────────────────────────
export const adminLoginFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { password: string }) => {
    if (!d?.password) throw new Error('Password required')
    return { password: d.password }
  })
  .handler(async ({ data }) => {
    if (data.password !== adminPassword()) throw new Error('Wrong password')
    await destroySession()
    await createSession('admin')
    return { ok: true }
  })

// ─── Full admin snapshot ─────────────────────────────────────────────
export const adminStateFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()
    if (!session || session.kind !== 'admin') return { loggedIn: false as const }

    const [settings, teamRows, companyRows, roundRows] = await Promise.all([
      getSettings(),
      db.select().from(teams).orderBy(desc(teams.balance)),
      db.select().from(companies).orderBy(asc(companies.name)),
      db.select().from(rounds).orderBy(desc(rounds.number)),
    ])

    const outcomeRows = await db.select().from(roundOutcomes)
    const invByRound = await db
      .select({
        roundId: investments.roundId,
        count: sql<number>`count(*)`,
      })
      .from(investments)
      .groupBy(investments.roundId)

    const invCounts = new Map<number, number>()
    for (const row of invByRound) {
      invCounts.set(row.roundId, row.count)
    }

    return {
      loggedIn: true as const,
      settings,
      teams: teamRows.map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        balance: t.balance,
      })),
      companies: companyRows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        multiplier: c.multiplier,
      })),
      rounds: roundRows.map((r) => ({
        id: r.id,
        number: r.number,
        scenario: r.scenario,
        status: r.status,
        investmentCount: invCounts.get(r.id) ?? 0,
        outcomes: outcomeRows
          .filter((o) => o.roundId === r.id)
          .map((o) => ({
            companyId: o.companyId,
            outcome: o.outcome,
            override: o.multiplierOverride,
          })),
      })),
    }
  },
)

// ─── Team management ─────────────────────────────────────────────────
export const generateTeamsFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { count: number }) => {
    const count = Math.floor(Number(d?.count))
    if (!Number.isInteger(count) || count < 1 || count > 50)
      throw new Error('Count must be between 1 and 50')
    return { count }
  })
  .handler(async ({ data }) => {
    await requireAdmin()
    const settings = await getSettings()

    const existing = await db.select().from(teams)
    let startIndex = existing.length + 1

    for (let i = 0; i < data.count; i++) {
      const name = `Team ${startIndex + i}`
      // retry until a unique code is generated
      for (let attempt = 0; attempt < 20; attempt++) {
        const code = generateTeamCode()
        const conflict = await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.code, code))
          .limit(1)
        if (!conflict[0]) {
          await db
            .insert(teams)
            .values({ name, code, balance: settings.startingBalance })
          break
        }
        if (attempt === 19) throw new Error('Could not generate unique code')
      }
    }
    return { ok: true }
  })

export const deleteTeamFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { teamId: number }) => {
    if (!d?.teamId) throw new Error('teamId required')
    return { teamId: d.teamId }
  })
  .handler(async ({ data }) => {
    await requireAdmin()
    await db.delete(teams).where(eq(teams.id, data.teamId))
    return { ok: true }
  })

// ─── Company management ──────────────────────────────────────────────
export const upsertCompanyFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { id?: number; name: string; description: string }) => {
    const name = (d?.name ?? '').trim()
    if (!name) throw new Error('Company name required')
    return { id: d.id, name, description: (d.description ?? '').trim() }
  })
  .handler(async ({ data }) => {
    await requireAdmin()
    if (data.id) {
      await db
        .update(companies)
        .set({ name: data.name, description: data.description })
        .where(eq(companies.id, data.id))
    } else {
      const settings = await getSettings()
      await db.insert(companies).values({
        name: data.name,
        description: data.description,
        multiplier: settings.baseMultiplier,
      })
    }
    return { ok: true }
  })

export const deleteCompanyFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { companyId: number }) => {
    if (!d?.companyId) throw new Error('companyId required')
    return { companyId: d.companyId }
  })
  .handler(async ({ data }) => {
    await requireAdmin()
    const refs = await db
      .select({ id: investments.id })
      .from(investments)
      .where(eq(investments.companyId, data.companyId))
      .limit(1)
    if (refs[0])
      throw new Error('Cannot delete a company that has investments')
    await db.delete(companies).where(eq(companies.id, data.companyId))
    return { ok: true }
  })

// ─── Round & scenario management ─────────────────────────────────────
export const createRoundFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { scenario?: string }) => ({
    scenario: (d?.scenario ?? '').trim(),
  }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const last = await db
      .select({ number: rounds.number })
      .from(rounds)
      .orderBy(desc(rounds.number))
      .limit(1)
    const number = (last[0]?.number ?? 0) + 1
    await db.insert(rounds).values({ number, scenario: data.scenario })
    return { number }
  })

export const updateRoundFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { roundId: number; scenario: string }) => {
    if (!d?.roundId) throw new Error('roundId required')
    return { roundId: d.roundId, scenario: (d.scenario ?? '').trim() }
  })
  .handler(async ({ data }) => {
    await requireAdmin()
    await db
      .update(rounds)
      .set({ scenario: data.scenario })
      .where(eq(rounds.id, data.roundId))
    return { ok: true }
  })

export const setOutcomeFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: {
      roundId: number
      companyId: number
      outcome: string
      override?: number | null
    }) => {
      if (!d?.roundId || !d?.companyId) throw new Error('Ids required')
      if (!isOutcome(d.outcome)) throw new Error("Outcome must be 'tank' or 'gain'")
      const override = d.override == null ? null : Math.floor(Number(d.override))
      if (override != null && (!Number.isInteger(override) || override < 1))
        throw new Error('Override multiplier must be a positive whole number')
      return {
        roundId: d.roundId,
        companyId: d.companyId,
        outcome: d.outcome,
        override,
      }
    },
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    const roundRows = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, data.roundId))
      .limit(1)
    const round = roundRows[0]
    if (!round) throw new Error('Round not found')
    if (round.status === 'resolved')
      throw new Error('Round already resolved; outcomes are locked')

    await db
      .insert(roundOutcomes)
      .values({
        roundId: data.roundId,
        companyId: data.companyId,
        outcome: data.outcome,
        multiplierOverride: data.override,
      })
      .onConflictDoUpdate({
        target: [roundOutcomes.roundId, roundOutcomes.companyId],
        set: { outcome: data.outcome, multiplierOverride: data.override },
      })
    return { ok: true }
  })

// ─── Game controls ───────────────────────────────────────────────────
export const startRoundFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { roundId: number }) => {
    if (!d?.roundId) throw new Error('roundId required')
    return { roundId: d.roundId }
  })
  .handler(async ({ data }) => {
    await requireAdmin()
    const active = await db
      .select({ id: rounds.id, status: rounds.status })
      .from(rounds)
      .where(ne(rounds.status, 'draft'))
    const busy = active.find((r) => r.status === 'open' || r.status === 'closed')
    if (busy) throw new Error('Another round is still in progress; resolve it first')
    await db
      .update(rounds)
      .set({ status: 'open' })
      .where(eq(rounds.id, data.roundId))
    return { ok: true }
  })

export const closeRoundFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { roundId: number }) => {
    if (!d?.roundId) throw new Error('roundId required')
    return { roundId: d.roundId }
  })
  .handler(async ({ data }) => {
    await requireAdmin()
    await db
      .update(rounds)
      .set({ status: 'closed' })
      .where(
        and(eq(rounds.id, data.roundId), eq(rounds.status, 'open')),
      )
    return { ok: true }
  })

// THE scoring core: resolve a round, pay returns, update multipliers.
export const resolveRoundFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { roundId: number }) => {
    if (!d?.roundId) throw new Error('roundId required')
    return { roundId: d.roundId }
  })
  .handler(async ({ data }) => {
    await requireAdmin()
    const settings = await getSettings()

    const summary = await db.transaction(async (tx) => {      const roundRows = await tx
        .select()
        .from(rounds)
        .where(eq(rounds.id, data.roundId))
        .limit(1)
      const round = roundRows[0]
      if (!round) throw new Error('Round not found')
      if (round.status === 'resolved') throw new Error('Already resolved')
      if (round.status === 'draft')
        throw new Error('Start the round before resolving it')

      const companyRows = await tx.select().from(companies)
      const outcomeRows = await tx
        .select()
        .from(roundOutcomes)
        .where(eq(roundOutcomes.roundId, round.id))

      const outcomeByCompany = new Map(
        outcomeRows.map((o) => [o.companyId, o] as const),
      )

      // Every company MUST have an explicit outcome before resolving.
      const missing = companyRows.filter((c) => !outcomeByCompany.has(c.id))
      if (missing.length > 0) {
        throw new Error(
          `Set outcomes for: ${missing.map((c) => c.name).join(', ')}`,
        )
      }

      const unresolvedInvestments = await tx
        .select()
        .from(investments)
        .where(eq(investments.roundId, round.id))

      // 1) Pay returns (gain). For tanks, return stays 0. Balances were
      //    already deducted at investment time; only add returns here.
      let totalPaid = 0
      for (const inv of unresolvedInvestments) {
        const outcome = outcomeByCompany.get(inv.companyId)!
        const rtrn = computeReturn(
          inv.amount,
          inv.multiplierAtInvestment,
          outcome.outcome === 'gain' ? 'gain' : 'tank',
        )
        await tx
          .update(investments)
          .set({ returnAmount: rtrn })
          .where(eq(investments.id, inv.id))
        if (rtrn > 0) {
          totalPaid += rtrn
          await tx
            .update(teams)
            .set({ balance: sql`${teams.balance} + ${rtrn}` })
            .where(eq(teams.id, inv.teamId))
        }
      }

      // 2) Update company multipliers for the next round.
      for (const company of companyRows) {
        const outcome = outcomeByCompany.get(company.id)!
        const next = nextMultiplier(
          company.multiplier,
          outcome.outcome === 'gain' ? 'gain' : 'tank',
          settings,
          outcome.multiplierOverride,
        )
        await tx
          .update(companies)
          .set({ multiplier: next })
          .where(eq(companies.id, company.id))
      }

      // 3) Mark the round resolved.
      await tx
        .update(rounds)
        .set({ status: 'resolved', resolvedAt: new Date() })
        .where(eq(rounds.id, round.id))

      return { investments: unresolvedInvestments.length, totalPaid }
    })
    return summary
  })

// ─── Global settings ─────────────────────────────────────────────────
export const updateSettingsFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: {
      startingBalance: number
      baseMultiplier: number
      multiplierIncrement: number
      allowMultipleInvestments: boolean
    }) => {
      for (const k of ['startingBalance', 'baseMultiplier', 'multiplierIncrement'] as const) {
        const v = Math.floor(Number(d?.[k]))
        if (!Number.isInteger(v) || v < 1)
          throw new Error(`${k} must be a positive whole number`)
      }
      return {
        startingBalance: Math.floor(Number(d.startingBalance)),
        baseMultiplier: Math.floor(Number(d.baseMultiplier)),
        multiplierIncrement: Math.floor(Number(d.multiplierIncrement)),
        allowMultipleInvestments: Boolean(d.allowMultipleInvestments),
      }
    },
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    await saveSettings(data)
    return { ok: true }
  })
