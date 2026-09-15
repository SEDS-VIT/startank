import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db } from '#/db'
import {
  companies,
  investments,
  roundOutcomes,
  rounds,
  teams,
} from '#/db/schema'
import { getSettings } from './settings'
import {
  createSession,
  destroySession,
  requireTeam,
} from './session'

// ─── Login / Logout ──────────────────────────────────────────────────
export const teamLoginFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { code: string }) => {
    const code = (d?.code ?? '').trim().toUpperCase()
    if (code.length !== 6) throw new Error('Code must be 6 characters')
    return { code }
  })
  .handler(async ({ data }) => {
    const rows = await db
      .select()
      .from(teams)
      .where(eq(teams.code, data.code))
      .limit(1)
    const team = rows[0]
    if (!team) throw new Error('Invalid team code')
    await destroySession()
    await createSession('team', team.id)
    return { name: team.name }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    await destroySession()
    return { ok: true }
  },
)

// ─── Rename own team ─────────────────────────────────────────────────
export const renameTeamFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { name: string }) => {
    const name = (d?.name ?? '').trim().replace(/\s+/g, ' ')
    if (!name) throw new Error('Team name required')
    if (name.length > 40) throw new Error('Name must be 40 characters or less')
    return { name }
  })
  .handler(async ({ data }) => {
    const team = await requireTeam()
    await db
      .update(teams)
      .set({ name: data.name })
      .where(eq(teams.id, team.id))
    return { name: data.name }
  })

// ─── Team full state (polled from the dashboard) ─────────────────────
export const teamStateFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const team = await requireTeam()

    // Latest visible round (drafts are hidden from teams)
    const roundRows = await db
      .select()
      .from(rounds)
      .where(ne(rounds.status, 'draft'))
      .orderBy(desc(rounds.number))
      .limit(1)
    const round = roundRows[0] ?? null

    const companyRows = await db
      .select()
      .from(companies)
      .orderBy(companies.name)

    let myInvestments: Array<{
      id: number
      companyId: number
      amount: number
      multiplier: number
      returnAmount: number | null
    }> = []

    let results: {
      roundNumber: number
      items: Array<{
        companyName: string
        amount: number
        outcome: string
        returnAmount: number
      }>
      totalReturn: number
    } | null = null

    if (round) {
      const invRows = await db
        .select()
        .from(investments)
        .where(
          and(
            eq(investments.roundId, round.id),
            eq(investments.teamId, team.id),
          ),
        )

      myInvestments = invRows.map((inv) => ({
        id: inv.id,
        companyId: inv.companyId,
        amount: inv.amount,
        multiplier: inv.multiplierAtInvestment,
        returnAmount: inv.returnAmount,
      }))

      if (round.status === 'resolved') {
        const companyNameById = new Map(
          companyRows.map((c) => [c.id, c.name] as const),
        )
        // Outcomes are read from the round record — they cannot be inferred
        // from returnAmount (a hold refunds the stake, which is > 0).
        const outcomeRows = await db
          .select()
          .from(roundOutcomes)
          .where(eq(roundOutcomes.roundId, round.id))
        const outcomeByCompany = new Map(
          outcomeRows.map((o) => [o.companyId, o.outcome] as const),
        )
        const items = invRows.map((inv) => {
          const rtrn = inv.returnAmount ?? 0
          const outcome = outcomeByCompany.get(inv.companyId) ?? 'tank'
          return {
            companyName: companyNameById.get(inv.companyId) ?? 'Unknown',
            amount: inv.amount,
            outcome,
            returnAmount: rtrn,
          }
        })
        results = {
          roundNumber: round.number,
          items,
          totalReturn: items.reduce((acc, it) => acc + it.returnAmount, 0),
        }
      }
    }

    return {
      team: { id: team.id, name: team.name, balance: team.balance },
      round: round
        ? {
            id: round.id,
            number: round.number,
            scenario: round.scenario,
            status: round.status,
          }
        : null,
      companies: companyRows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        multiplier: c.multiplier,
      })),
      myInvestments,
      results,
    }
  },
)

// ─── Submit an investment ────────────────────────────────────────────
export const submitInvestmentFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { companyId: number; amount: number }) => {
    const amount = Math.floor(Number(d?.amount))
    if (!d?.companyId) throw new Error('Select a company')
    if (!Number.isInteger(amount) || amount < 1)
      throw new Error('Amount must be a positive whole number')
    return { companyId: d.companyId, amount }
  })
  .handler(async ({ data }) => {
    const team = await requireTeam()
    const settings = await getSettings()

    const openRounds = await db
      .select()
      .from(rounds)
      .where(eq(rounds.status, 'open'))
      .limit(1)
    const round = openRounds[0]
    if (!round) throw new Error('Investing is closed. Wait for the next round.')

    const companyRows = await db
      .select()
      .from(companies)
      .where(eq(companies.id, data.companyId))
      .limit(1)
    const company = companyRows[0]
    if (!company) throw new Error('Unknown company')

    if (!settings.allowMultipleInvestments) {
      const existing = await db
        .select()
        .from(investments)
        .where(
          and(
            eq(investments.roundId, round.id),
            eq(investments.teamId, team.id),
          ),
        )
        .limit(1)
      if (existing[0])
        throw new Error('Already invested this round. You are locked in.')
    }

    if (data.amount > team.balance) throw new Error('Insufficient balance')

    // Immediate deduction: Current Balance = Current Balance - i
    await db
      .update(teams)
      .set({ balance: team.balance - data.amount })
      .where(eq(teams.id, team.id))

    await db.insert(investments).values({
      roundId: round.id,
      teamId: team.id,
      companyId: company.id,
      amount: data.amount,
      multiplierAtInvestment: company.multiplier,
    })

    return { balance: team.balance - data.amount }
  })
