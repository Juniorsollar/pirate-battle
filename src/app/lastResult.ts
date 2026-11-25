import type { MatchRecord } from '../api/contracts'

const STORAGE_KEY = 'pirate-battle:last-result:v1'

/** Last completed match, kept locally so the result survives a refresh. */
export function loadLastResult(): MatchRecord | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as MatchRecord | null
    return value && typeof value.matchId === 'string' && typeof value.score === 'number' ? value : null
  } catch {
    return null
  }
}

export function saveLastResult(record: MatchRecord) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
}
