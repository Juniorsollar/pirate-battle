import type { MatchRecord } from '../api/contracts'
import { initialRecords } from './fixtures'

/** "Server side" storage of the mock API, persisted so confirmed records survive a refresh. */
const STORAGE_KEY = 'pirate-battle:mockdb:v1'

function read(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed as MatchRecord[]
    }
  } catch {
    // corrupted storage: fall back to the fixtures
  }
  const records = initialRecords()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  return records
}

export const db = {
  all: read,
  find(matchId: string) {
    return read().find((r) => r.matchId === matchId)
  },
  insert(record: MatchRecord) {
    const records = read()
    records.push(record)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  },
  reset() {
    localStorage.removeItem(STORAGE_KEY)
    read()
  },
}
