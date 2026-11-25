/** Typed contracts shared by the app, the MSW mocks and the tests. */

export type EndReason = 'time_up' | 'destroyed'

/** The part of the gameplay configuration that defines which matches are comparable. */
export interface MatchSettings {
  durationSec: number
  spawnIntervalSec: number
}

export interface MatchRecord {
  matchId: string
  playerId: string
  playerName: string
  /** ISO date of when the match ended */
  playedAt: string
  score: number
  /** effective played time, seconds */
  durationSec: number
  endReason: EndReason
  config: MatchSettings
  /** e.g. "120-3"; ranking only compares matches with the same key */
  configKey: string
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface RankingEntry extends MatchRecord {
  rank: number
}

export interface ApiError {
  error: string
}

export const PAGE_SIZE = 5

export function configKey({ durationSec, spawnIntervalSec }: MatchSettings) {
  return `${durationSec}-${spawnIntervalSec}`
}

/** Deterministic ranking order: score desc, then earlier match first, then matchId. */
export function compareRanking(a: MatchRecord, b: MatchRecord) {
  return b.score - a.score || a.playedAt.localeCompare(b.playedAt) || a.matchId.localeCompare(b.matchId)
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    pageSize,
    totalItems: items.length,
    totalPages,
  }
}
