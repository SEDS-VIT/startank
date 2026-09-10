import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-neutral-100">
      <div className="w-full max-w-md text-center">
        <h1 className="text-4xl font-black">🚀 StarTank</h1>
        <p className="mt-2 text-neutral-400">
          Multiplayer investment game — pick your stakes before the market moves.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            to="/team"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 transition hover:border-emerald-500"
          >
            <p className="text-xl font-bold text-emerald-400">Teams</p>
            <p className="mt-1 text-sm text-neutral-400">
              Join with your 6-char code
            </p>
          </Link>
          <Link
            to="/admin"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 transition hover:border-sky-500"
          >
            <p className="text-xl font-bold text-sky-400">Admin</p>
            <p className="mt-1 text-sm text-neutral-400">
              Control the game
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
