import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  submitInvestmentFn,
  teamLoginFn,
  teamStateFn,
  logoutFn,
  renameTeamFn,
} from '#/server/team'
import { fmt, errMsg } from '#/lib/format'

export const Route = createFileRoute('/team')({ component: TeamPage })

type TeamState = Awaited<ReturnType<typeof teamStateFn>>

function TeamPage() {
  const [state, setState] = useState<TeamState | null>(null)

  const refresh = async () => {
    try {
      setState(await teamStateFn())
    } catch {
      setState(null)
    }
  }

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 1500)
    return () => clearInterval(t)
  }, [])

  if (!state) return <TeamLogin onSuccess={() => void refresh()} />
  return <TeamDashboard state={state} refresh={refresh} />
}

// ─── Login ───────────────────────────────────────────────────────────
function TeamLogin({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await teamLoginFn({ data: { code } })
      onSuccess()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4 text-neutral-100">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
        <h1 className="text-2xl font-bold">StarTank</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Enter your 6-character team code
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="e.g. K7Q2PZ"
            autoFocus
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-emerald-400 outline-none focus:border-emerald-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-lg bg-emerald-600 py-3 font-semibold transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {busy ? 'Verifying…' : 'Join Game'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────
function TeamDashboard({
  state,
  refresh,
}: {
  state: TeamState
  refresh: () => Promise<void>
}) {
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const seenResultsRef = useRef<number | null>(null)

  const round = state.round
  const investingOpen = round?.status === 'open'
  const hasInvestments = state.myInvestments.length > 0

  // Fire a toast when a round resolves with this team's investments.
  useEffect(() => {
    const results = state.results
    if (!results) return
    if (seenResultsRef.current !== results.roundNumber) {
      seenResultsRef.current = results.roundNumber
      const gained = results.items
        .filter((i) => i.outcome === 'gain')
        .reduce((a, i) => a + i.returnAmount, 0)
      const lost = results.items
        .filter((i) => i.outcome === 'tank')
        .reduce((a, i) => a + i.amount, 0)
      const returned = results.items
        .filter((i) => i.outcome === 'hold')
        .reduce((a, i) => a + i.returnAmount, 0)
      const parts: string[] = []
      if (gained > 0) parts.push(`won ${fmt(gained)}`)
      if (lost > 0) parts.push(`lost ${fmt(lost)}`)
      if (returned > 0) parts.push(`got back ${fmt(returned)} (no gain, no loss)`)
      setToast(
        `Round ${results.roundNumber} resolved — you ${parts.join(' and ') || 'had no action'}.`,
      )
      setTimeout(() => setToast(null), 9000)
    }
  }, [state.results])

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      await submitInvestmentFn({
        data: { companyId: selectedCompany!, amount: Number(amount) },
      })
      setAmount('')
      await refresh()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    investingOpen &&
    selectedCompany != null &&
    amount !== '' &&
    !busy

  const saveName = async () => {
    setNameError(null)
    try {
      await renameTeamFn({ data: { name: nameDraft } })
      setEditingName(false)
      await refresh()
    } catch (err) {
      setNameError(errMsg(err))
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-neutral-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            {editingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveName()
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={40}
                  autoFocus
                  className="w-40 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false)
                    setNameError(null)
                  }}
                  className="text-xs text-neutral-500 hover:text-neutral-300"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <p className="text-xs text-neutral-400">
                {state.team.name}
                <button
                  onClick={() => {
                    setNameDraft(state.team.name)
                    setNameError(null)
                    setEditingName(true)
                  }}
                  className="ml-2 text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
                  title="Rename team"
                >
                  rename
                </button>
              </p>
            )}
            {nameError && (
              <p className="mt-0.5 text-xs text-red-400">{nameError}</p>
            )}
            <p className="text-xl font-bold text-emerald-400">
              ${fmt(state.team.balance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-400">Round</p>
            <p className="text-lg font-bold">
              {round ? round.number : '—'}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Scenario + status */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              {round ? `Round ${round.number} — Current Situation` : 'Waiting for the game to start'}
            </h2>
            <StatusBadge status={round?.status} />
          </div>
          {round?.scenario && (
            <p className="mt-2 whitespace-pre-wrap text-neutral-200">
              {round.scenario}
            </p>
          )}
        </div>

        {/* Companies */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Companies — tap to invest
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state.companies.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCompany(c.id)}
                disabled={!investingOpen || hasInvestments}
                className={`rounded-xl border p-4 text-left transition ${
                  selectedCompany === c.id
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{c.name}</h3>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                    {c.multiplier}x
                  </span>
                </div>
                {c.description && (
                  <p className="mt-1 text-sm text-neutral-400">{c.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Locked-in investments */}
        {hasInvestments && (
          <section className="rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-5">
            <h2 className="text-sm font-semibold text-emerald-300">
              Waiting for Admin to resolve round…
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {state.myInvestments.map((inv) => (
                <li key={inv.id}>
                  <span className="font-medium">
                    {state.companies.find((c) => c.id === inv.companyId)?.name}
                  </span>
                  {' — '}
                  ${fmt(inv.amount)} @ {inv.multiplier}x
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Investment form */}
        {investingOpen && !hasInvestments && (
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Investment amount"
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {busy ? 'Locking in…' : 'Invest'}
              </button>
            </div>
            {selectedCompany != null && (
              <p className="mt-2 text-xs text-neutral-400">
                Investing in{' '}
                {state.companies.find((c) => c.id === selectedCompany)?.name}
              </p>
            )}
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </section>
        )}

        {round?.status === 'closed' && !hasInvestments && (
          <p className="text-center text-sm text-neutral-400">
            Investments are locked for this round.
          </p>
        )}
      </main>

      {/* Logout */}
      <button
        onClick={() => void logoutFn().then(() => window.location.reload())}
        className="fixed bottom-3 right-3 text-xs text-neutral-500 hover:text-neutral-300"
      >
        Log out
      </button>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-emerald-700 bg-neutral-900 px-5 py-3 text-sm shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: 'Investing open', cls: 'bg-emerald-600/20 text-emerald-400' },
    closed: { label: 'Locked', cls: 'bg-amber-600/20 text-amber-400' },
    resolved: { label: 'Resolved', cls: 'bg-sky-600/20 text-sky-400' },
  }
  const s = map[status]
  if (!s) return null
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  )
}
