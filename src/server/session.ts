import { eq } from 'drizzle-orm'
import {
  getCookie,
  setCookie,
  deleteCookie,
} from '@tanstack/react-start/server'
import { db } from '#/db'
import { sessions, teams } from '#/db/schema'

const COOKIE_NAME = 'startank_session'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export type SessionKind = 'admin' | 'team'

export interface SessionInfo {
  kind: SessionKind
  teamId: number | null
}

function newToken(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createSession(
  kind: SessionKind,
  teamId: number | null = null,
): Promise<void> {
  const token = newToken()
  await db.insert(sessions).values({
    token,
    kind,
    teamId,
    expiresAt: new Date(Date.now() + TTL_MS),
  })
  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS / 1000,
  })
}

export async function getSession(): Promise<SessionInfo | null> {
  const token = getCookie(COOKIE_NAME)
  if (!token) return null
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.token, token))
    deleteCookie(COOKIE_NAME, { path: '/' })
    return null
  }
  return { kind: row.kind as SessionKind, teamId: row.teamId }
}

export async function destroySession(): Promise<void> {
  const token = getCookie(COOKIE_NAME)
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token))
  }
  deleteCookie(COOKIE_NAME, { path: '/' })
}

/** Throws unless an admin session is active. */
export async function requireAdmin(): Promise<void> {
  const s = await getSession()
  if (!s || s.kind !== 'admin') throw new Error('Unauthorized')
}

/** Throws unless a valid team session is active; returns the team row. */
export async function requireTeam(): Promise<typeof teams.$inferSelect> {
  const s = await getSession()
  if (!s || s.kind !== 'team' || s.teamId == null) throw new Error('Unauthorized')
  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.id, s.teamId))
    .limit(1)
  if (!rows[0]) throw new Error('Unauthorized')
  return rows[0]
}
