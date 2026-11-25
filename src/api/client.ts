import axios, { isAxiosError } from 'axios'
import type { MatchRecord, Page, RankingEntry } from './contracts'

export const REQUEST_TIMEOUT_MS = 4000

export const http = axios.create({
  baseURL: `${import.meta.env.BASE_URL}api`,
  timeout: REQUEST_TIMEOUT_MS,
})

export function fetchRanking(params: { configKey: string; page: number; pageSize: number }, signal: AbortSignal) {
  return http.get<Page<RankingEntry>>('/ranking', { params, signal }).then((r) => r.data)
}

export function fetchHistory(playerId: string, params: { page: number; pageSize: number }, signal: AbortSignal) {
  return http.get<Page<MatchRecord>>(`/players/${encodeURIComponent(playerId)}/matches`, { params, signal }).then((r) => r.data)
}

/** Idempotent: the server returns the existing record (200) when the matchId was already stored. */
export function submitMatch(record: MatchRecord) {
  return http.post<MatchRecord>('/matches', record, { headers: { 'Idempotency-Key': record.matchId } }).then((r) => r.data)
}

/** Retry only what can succeed later: timeouts, connection errors and 5xx. */
export function isRetryable(error: unknown) {
  if (!isAxiosError(error)) return false
  if (!error.response) return true
  return error.response.status >= 500
}

export function describeError(error: unknown) {
  if (!isAxiosError(error)) return 'Unexpected error.'
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'The server took too long to answer.'
  if (!error.response) return 'Could not reach the server.'
  return `The server answered with an error (${error.response.status}).`
}
