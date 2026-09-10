import { db } from '#/db'
import { settings } from '#/db/schema'
import { DEFAULT_SETTINGS, type GameSettings } from '#/lib/game'

const NUM_KEYS = [
  'startingBalance',
  'baseMultiplier',
  'multiplierIncrement',
] as const
const BOOL_KEYS = ['allowMultipleInvestments'] as const

type NumKey = (typeof NUM_KEYS)[number]
type BoolKey = (typeof BOOL_KEYS)[number]

function isNumKey(k: string): k is NumKey {
  return (NUM_KEYS as readonly string[]).includes(k)
}
function isBoolKey(k: string): k is BoolKey {
  return (BOOL_KEYS as readonly string[]).includes(k)
}

/** Read settings from DB merged over defaults. */
export async function getSettings(): Promise<GameSettings> {
  const rows = await db.select().from(settings)
  const result = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (isNumKey(row.key)) {
      const n = Number(row.value)
      if (Number.isFinite(n)) result[row.key] = n
    } else if (isBoolKey(row.key)) {
      result[row.key] = row.value === 'true'
    }
  }
  return result
}

/** Persist a full (validated) settings object. */
export async function saveSettings(s: GameSettings): Promise<void> {
  for (const key of NUM_KEYS) {
    const value = String(s[key])
    await db.insert(settings).values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
  }
  for (const key of BOOL_KEYS) {
    const value = String(s[key])
    await db.insert(settings).values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
  }
}
