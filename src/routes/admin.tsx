import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
    adminLoginFn,
    adminStateFn,
    closeRoundFn,
    createRoundFn,
    deleteCompanyFn,
    deleteTeamFn,
    generateTeamsFn,
    resolveRoundFn,
    setOutcomeFn,
    startRoundFn,
    updateRoundFn,
    updateSettingsFn,
    upsertCompanyFn,
    clearData,
} from '#/server/admin'
import { logoutFn } from '#/server/team'
import { fmt, errMsg } from '#/lib/format'

export const Route = createFileRoute('/admin')({ component: AdminPage })

type AdminState = Awaited<ReturnType<typeof adminStateFn>>
type AdminData = Extract<AdminState, { loggedIn: true }>

function AdminPage() {
    const [state, setState] = useState<AdminData | null>(null)

    const refresh = async () => {
        try {
            const s = await adminStateFn()
            setState(s.loggedIn ? s : null)
        } catch {
            setState(null)
        }
    }

    useEffect(() => {
        void refresh()
        const t = setInterval(() => void refresh(), 2000)
        return () => clearInterval(t)
    }, [])

    if (!state) return <AdminLogin onSuccess={() => void refresh()} />
    return <AdminDashboard state={state} refresh={refresh} />
}

// ─── Login ───────────────────────────────────────────────────────────
function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
            await adminLoginFn({ data: { password } })
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
                <h1 className="text-2xl font-bold">StarTank Admin</h1>
                <form onSubmit={submit} className="mt-6 space-y-4">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Master admin password"
                        autoFocus
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none focus:border-emerald-500"
                    />
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <button
                        type="submit"
                        disabled={busy || !password}
                        className="w-full rounded-lg bg-emerald-600 py-3 font-semibold transition hover:bg-emerald-500 disabled:opacity-40"
                    >
                        {busy ? 'Verifying…' : 'Log in'}
                    </button>
                </form>
            </div>
        </div>
    )
}

// ─── Dashboard ───────────────────────────────────────────────────────
function AdminDashboard({
    state,
    refresh,
}: {
    state: AdminData
    refresh: () => Promise<void>
}) {
    const [notice, setNotice] = useState<string | null>(null)

    const act = async (fn: () => Promise<unknown>, ok?: string) => {
        try {
            await fn()
            setNotice(ok ?? null)
            if (ok) setTimeout(() => setNotice(null), 6000)
            await refresh()
        } catch (e) {
            setNotice(errMsg(e))
        }
    }

    return (
        <div className="min-h-screen bg-neutral-950 pb-20 text-neutral-100">
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-bold">StarTank — Admin</h1>
                    <button
                        onClick={() => {
                            if (!window.confirm('Are you sure you want to delete all game data? This action cannot be undone.')) {
                                return
                            }
                            void act(() => clearData(), 'All game data successfully cleared')
                        }}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500"
                    >
                        Clear Data
                    </button>
                    <button
                        onClick={() => void logoutFn().then(() => window.location.reload())}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                    >
                        Log out
                    </button>
                </div>
            </header>

            {notice && (
                <div className="mx-auto max-w-6xl px-4 pt-4">
                    <div className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
                        {notice}
                    </div>
                </div>
            )}

            <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
                <GameControls state={state} act={act} />
                <div className="grid gap-8 lg:grid-cols-2">
                    <TeamsPanel state={state} act={act} />
                    <CompaniesPanel state={state} act={act} />
                </div>
                <SettingsPanel state={state} act={act} />
            </main>
        </div>
    )
}

// ─── Game Controls: rounds, scenario, outcomes, start/close/resolve ──
function GameControls({
    state,
    act,
}: {
    state: AdminData
    act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
}) {
    const [scenarioDraft, setScenarioDraft] = useState('')

    const active = state.rounds.find(
        (r) => r.status === 'open' || r.status === 'closed',
    )
    const drafts = state.rounds.filter((r) => r.status === 'draft')
    const resolved = state.rounds.filter((r) => r.status === 'resolved')

    return (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Game Controls
            </h2>

            {/* Active round control */}
            {active ? (
                <RoundCard
                    round={active}
                    companies={state.companies}
                    act={act}
                    isActive
                />
            ) : (
                <p className="text-sm text-neutral-400">
                    No round in progress. Start a drafted round below or create a new one.
                </p>
            )}

            {/* New round creation */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                    value={scenarioDraft}
                    onChange={(e) => setScenarioDraft(e.target.value)}
                    placeholder="New round scenario (e.g. “Tech stocks surge as market opens”)"
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <button
                    onClick={() =>
                        void act(async () => {
                            await createRoundFn({ data: { scenario: scenarioDraft } })
                            setScenarioDraft('')
                        }, 'Round drafted')
                    }
                    className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold hover:bg-neutral-700"
                >
                    + Draft Round
                </button>
            </div>

            {/* Drafted rounds */}
            {drafts.length > 0 && (
                <div className="mt-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase text-neutral-500">
                        Drafted
                    </h3>
                    {drafts.map((r) => (
                        <RoundCard
                            key={r.id}
                            round={r}
                            companies={state.companies}
                            act={act}
                            isActive={false}
                        />
                    ))}
                </div>
            )}

            {/* Resolved rounds (latest on top) */}
            {resolved.length > 0 && (
                <div className="mt-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase text-neutral-500">
                        Resolved
                    </h3>
                    {resolved.map((r) => (
                        <div
                            key={r.id}
                            className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-semibold">Round {r.number}</span>
                                <span className="rounded-full bg-sky-600/20 px-2.5 py-1 text-xs font-semibold text-sky-400">
                                    Resolved
                                </span>
                            </div>
                            {r.scenario && (
                                <p className="mt-1 text-sm text-neutral-400">{r.scenario}</p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                                {r.outcomes.map((o) => {
                                    const c = state.companies.find((x) => x.id === o.companyId)
                                    return (
                                        <span
                                            key={o.companyId}
                                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.outcome === 'gain'
                                                    ? 'bg-emerald-600/20 text-emerald-400'
                                                    : o.outcome === 'hold'
                                                        ? 'bg-amber-600/20 text-amber-400'
                                                        : 'bg-red-600/20 text-red-400'
                                                }`}
                                        >
                                            {c?.name}: {o.outcome}
                                        </span>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}

function RoundCard({
    round,
    companies,
    act,
    isActive,
}: {
    round: AdminData['rounds'][number]
    companies: AdminData['companies']
    act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
    isActive: boolean
}) {
    const [scenario, setScenario] = useState(round.scenario)

    const outcomeFor = (companyId: number) =>
        round.outcomes.find((o) => o.companyId === companyId)

    return (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                    Round {round.number}
                    <span className="ml-2 text-xs font-normal text-neutral-500">
                        {round.investmentCount} investments
                    </span>
                </span>
                <div className="flex gap-2">
                    {round.status === 'draft' && (
                        <button
                            onClick={() =>
                                void act(
                                    () => startRoundFn({ data: { roundId: round.id } }),
                                    `Round ${round.number} is live!`,
                                )
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold hover:bg-emerald-500"
                        >
                            Start Round
                        </button>
                    )}
                    {round.status === 'open' && (
                        <button
                            onClick={() =>
                                void act(
                                    () => closeRoundFn({ data: { roundId: round.id } }),
                                    'Investments closed',
                                )
                            }
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold hover:bg-amber-500"
                        >
                            Close Investments
                        </button>
                    )}
                    {isActive && (
                        <button
                            onClick={() =>
                                void act(
                                    () => resolveRoundFn({ data: { roundId: round.id } }),
                                    `Round ${round.number} resolved`,
                                )
                            }
                            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold hover:bg-sky-500"
                        >
                            Resolve Round
                        </button>
                    )}
                </div>
            </div>

            {/* Scenario editor */}
            <div className="mt-3 flex gap-2">
                <textarea
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                    rows={2}
                    disabled={round.status === 'resolved'}
                    placeholder="Scenario text…"
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-60"
                />
                {round.status !== 'resolved' && scenario !== round.scenario && (
                    <button
                        onClick={() =>
                            void act(
                                () =>
                                    updateRoundFn({
                                        data: { roundId: round.id, scenario },
                                    }),
                                'Scenario saved',
                            )
                        }
                        className="self-end rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-700"
                    >
                        Save
                    </button>
                )}
            </div>

            {/* Outcome picker per company (editable until resolved) */}
            <div className="mt-3 space-y-2">
                {companies.map((c) => {
                    const outcome = outcomeFor(c.id)
                    const disabled = round.status === 'resolved'
                    return (
                        <div
                            key={c.id}
                            className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${outcome ? 'border-neutral-800' : 'border-red-800/60'
                                }`}
                        >
                            <span className="min-w-28 flex-1 text-sm font-medium">
                                {c.name}
                                <span className="ml-2 text-xs text-neutral-500">
                                    ({c.multiplier}x)
                                </span>
                            </span>
                            {(['tank', 'gain', 'hold'] as const).map((o) => (
                                <button
                                    key={o}
                                    disabled={disabled}
                                    onClick={() =>
                                        void act(
                                            () =>
                                                setOutcomeFn({
                                                    data: {
                                                        roundId: round.id,
                                                        companyId: c.id,
                                                        outcome: o,
                                                        override: outcome?.override ?? null,
                                                    },
                                                }),
                                            `${c.name} → ${o}`,
                                        )
                                    }
                                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition disabled:opacity-50 ${outcome?.outcome === o
                                            ? o === 'gain'
                                                ? 'bg-emerald-600 text-white'
                                                : o === 'hold'
                                                    ? 'bg-amber-600 text-white'
                                                    : 'bg-red-600 text-white'
                                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                        }`}
                                >
                                    {o.toUpperCase()}
                                </button>
                            ))}
                            <input
                                key={`${c.id}-${outcome?.override ?? 'none'}`}
                                type="number"
                                min={1}
                                defaultValue={outcome?.override ?? ''}
                                disabled={disabled}
                                placeholder="next x (opt.)"
                                title="Optional: next multiplier override"
                                onBlur={(e) => {
                                    const v = e.target.value.trim()
                                    const override = v === '' ? null : Number(v)
                                    if (!outcome?.outcome) return
                                    if ((outcome.override ?? null) !== override) {
                                        void act(
                                            () =>
                                                setOutcomeFn({
                                                    data: {
                                                        roundId: round.id,
                                                        companyId: c.id,
                                                        outcome: outcome.outcome,
                                                        override,
                                                    },
                                                }),
                                            `${c.name} override saved`,
                                        )
                                    }
                                }}
                                className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs outline-none focus:border-emerald-500 disabled:opacity-50"
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Teams (leaderboard + generation) ────────────────────────────────
function TeamsPanel({
    state,
    act,
}: {
    state: AdminData
    act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
}) {
    const [count, setCount] = useState('5')
    return (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Teams (live leaderboard)
            </h2>
            <div className="mb-4 flex gap-2">
                <input
                    type="number"
                    min={1}
                    max={50}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="w-20 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <button
                    onClick={() =>
                        void act(
                            () => generateTeamsFn({ data: { count: Number(count) } }),
                            'Teams generated',
                        )
                    }
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
                >
                    Generate
                </button>
            </div>
            <div className="space-y-2">
                {state.teams.map((t, i) => (
                    <div
                        key={t.id}
                        className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2"
                    >
                        <span className="w-5 text-xs text-neutral-500">#{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                        <code className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-bold tracking-widest text-amber-400">
                            {t.code}
                        </code>
                        <span className="w-24 text-right text-sm font-bold text-emerald-400">
                            ${fmt(t.balance)}
                        </span>
                        <button
                            onClick={() =>
                                void act(
                                    () => deleteTeamFn({ data: { teamId: t.id } }),
                                    `${t.name} deleted`,
                                )
                            }
                            className="text-xs text-red-400 hover:text-red-300"
                            title="Delete team"
                        >
                            ✕
                        </button>
                    </div>
                ))}
                {state.teams.length === 0 && (
                    <p className="text-sm text-neutral-500">No teams yet.</p>
                )}
            </div>
        </section>
    )
}

// ─── Companies ───────────────────────────────────────────────────────
function CompaniesPanel({
    state,
    act,
}: {
    state: AdminData
    act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
}) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [editId, setEditId] = useState<number | null>(null)

    const submit = async () => {
        await act(async () => {
            await upsertCompanyFn({
                data: { id: editId ?? undefined, name, description },
            })
            setName('')
            setDescription('')
            setEditId(null)
        }, editId ? 'Company updated' : 'Company added')
    }

    return (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Companies
            </h2>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description"
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <button
                    onClick={() => void submit()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
                >
                    {editId ? 'Save' : 'Add'}
                </button>
            </div>
            <div className="space-y-2">
                {state.companies.map((c) => (
                    <div
                        key={c.id}
                        className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{c.name}</p>
                            {c.description && (
                                <p className="truncate text-xs text-neutral-500">
                                    {c.description}
                                </p>
                            )}
                        </div>
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                            {c.multiplier}x
                        </span>
                        <button
                            onClick={() => {
                                setEditId(c.id)
                                setName(c.name)
                                setDescription(c.description)
                            }}
                            className="text-xs text-sky-400 hover:text-sky-300"
                        >
                            Edit
                        </button>
                        <button
                            onClick={() =>
                                void act(
                                    () => deleteCompanyFn({ data: { companyId: c.id } }),
                                    `${c.name} deleted`,
                                )
                            }
                            className="text-xs text-red-400 hover:text-red-300"
                        >
                            ✕
                        </button>
                    </div>
                ))}
                {state.companies.length === 0 && (
                    <p className="text-sm text-neutral-500">No companies yet.</p>
                )}
            </div>
        </section>
    )
}

// ─── Global settings ─────────────────────────────────────────────────
function SettingsPanel({
    state,
    act,
}: {
    state: AdminData
    act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
}) {
    const s = state.settings
    const [startingBalance, setStartingBalance] = useState(String(s.startingBalance))
    const [baseMultiplier, setBaseMultiplier] = useState(String(s.baseMultiplier))
    const [increment, setIncrement] = useState(String(s.multiplierIncrement))
    const [allowMultiple, setAllowMultiple] = useState(s.allowMultipleInvestments)

    return (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Global Settings
            </h2>
            <div className="flex flex-wrap items-end gap-4">
                <label className="block">
                    <span className="text-xs text-neutral-400">Starting balance</span>
                    <input
                        type="number"
                        min={1}
                        value={startingBalance}
                        onChange={(e) => setStartingBalance(e.target.value)}
                        className="mt-1 w-40 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                </label>
                <label className="block">
                    <span className="text-xs text-neutral-400">Base multiplier</span>
                    <input
                        type="number"
                        min={1}
                        value={baseMultiplier}
                        onChange={(e) => setBaseMultiplier(e.target.value)}
                        className="mt-1 w-28 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                </label>
                <label className="block">
                    <span className="text-xs text-neutral-400">Gain increment (+x)</span>
                    <input
                        type="number"
                        min={1}
                        value={increment}
                        onChange={(e) => setIncrement(e.target.value)}
                        className="mt-1 w-28 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                        type="checkbox"
                        checked={allowMultiple}
                        onChange={(e) => setAllowMultiple(e.target.checked)}
                        className="h-4 w-4 accent-emerald-500"
                    />
                    Allow multiple investments per round
                </label>
                <button
                    onClick={() =>
                        void act(
                            () =>
                                updateSettingsFn({
                                    data: {
                                        startingBalance: Number(startingBalance),
                                        baseMultiplier: Number(baseMultiplier),
                                        multiplierIncrement: Number(increment),
                                        allowMultipleInvestments: allowMultiple,
                                    },
                                }),
                            'Settings saved',
                        )
                    }
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
                >
                    Save Settings
                </button>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
                New teams start at the configured balance; new companies start at the
                configured base multiplier. Changes apply immediately.
            </p>
        </section>
    )
}
