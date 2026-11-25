import { createStore } from '../game/store'
import type { MatchRecord } from './contracts'

/**
 * Matches finished locally but not yet confirmed by the API. Persisted before the first send,
 * so a failure, timeout or refresh never loses a result; resends reuse the same matchId.
 */
export type OutboxStatus = 'pending' | 'sending' | 'failed'

export interface OutboxEntry {
  record: MatchRecord
  status: OutboxStatus
  error?: string
}

const STORAGE_KEY = 'pirate-battle:pending-matches:v1'

function load(): OutboxEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    // A send interrupted by a refresh is just pending again.
    return (parsed as OutboxEntry[]).map((e) => ({ record: e.record, status: e.status === 'failed' ? 'failed' : 'pending', ...(e.error ? { error: e.error } : {}) }))
  } catch {
    return []
  }
}

export const outboxStore = createStore<{ entries: OutboxEntry[] }>({ entries: load() })

function save(entries: OutboxEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  outboxStore.set({ entries })
}

export const outbox = {
  entries: () => outboxStore.get().entries,
  find: (matchId: string) => outboxStore.get().entries.find((e) => e.record.matchId === matchId),
  add(record: MatchRecord) {
    if (outbox.find(record.matchId)) return
    save([...outbox.entries(), { record, status: 'pending' }])
  },
  setStatus(matchId: string, status: OutboxStatus, error?: string) {
    save(outbox.entries().map((e) => (e.record.matchId === matchId ? { record: e.record, status, ...(error ? { error } : {}) } : e)))
  },
  remove(matchId: string) {
    save(outbox.entries().filter((e) => e.record.matchId !== matchId))
  },
}
