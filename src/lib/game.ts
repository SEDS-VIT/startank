// Core scoring logic for StarTank.
// All money amounts are integers; multipliers are integers (e.g. 2 == "2x").

export type Outcome = 'tank' | 'gain' | 'hold'

export type RoundStatus = 'draft' | 'open' | 'closed' | 'resolved'

export interface GameSettings {
  startingBalance: number
  baseMultiplier: number
  multiplierIncrement: number
  allowMultipleInvestments: boolean
}

export const DEFAULT_SETTINGS: GameSettings = {
  startingBalance: 100_000,
  baseMultiplier: 2,
  multiplierIncrement: 1,
  allowMultipleInvestments: false,
}

/**
 * Payout for an investment given its outcome.
 * Tank => 0 (money already deducted). Gain => amount × multiplier.
 * Hold => exact refund of the amount (no gain, no loss).
 */
export function computeReturn(
  amount: number,
  multiplier: number,
  outcome: Outcome,
): number {
  if (outcome === 'gain') return amount * multiplier
  if (outcome === 'hold') return amount
  return 0
}

/**
 * Next multiplier for a company after a round resolves.
 * GAIN: current + increment (e.g. 2x -> 3x).
 * TANK: reset to base multiplier.
 * HOLD: unchanged.
 * An explicit override (set by admin) bypasses the default rule.
 */
export function nextMultiplier(
  current: number,
  outcome: Outcome,
  settings: Pick<GameSettings, 'baseMultiplier' | 'multiplierIncrement'>,
  override?: number | null,
): number {
  if (override != null) return override
  if (outcome === 'gain') return current + settings.multiplierIncrement
  if (outcome === 'hold') return current
  return settings.baseMultiplier
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // ambiguous chars removed (0/O/1/I/L)

/** Random 6-char alphanumeric team access code. */
export function generateTeamCode(length = 6): string {
  const bytes = new Uint32Array(length)
  globalThis.crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length]
  }
  return code
}

export function isOutcome(v: string): v is Outcome {
  return v === 'tank' || v === 'gain' || v === 'hold'
}

export function isRoundStatus(v: string): v is RoundStatus {
  return v === 'draft' || v === 'open' || v === 'closed' || v === 'resolved'
}
