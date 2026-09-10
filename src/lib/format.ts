export function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e)
    return String((e as { message: unknown }).message)
  return String(e)
}
