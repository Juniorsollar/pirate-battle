import { delay, http, HttpResponse } from 'msw'
import { REQUEST_TIMEOUT_MS } from '../api/client'
import { compareRanking, configKey, paginate, PAGE_SIZE, type MatchRecord } from '../api/contracts'
import { db } from './db'
import { generateRecords } from './fixtures'
import { getScenario, latencyFor, type ScenarioName } from './scenarios'

const API = `${import.meta.env.BASE_URL}api`
const BEYOND_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 2000

function pageParams(url: URL) {
  const page = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('pageSize') ?? PAGE_SIZE)
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 50 ? pageSize : PAGE_SIZE,
  }
}

/** Shared failure modes. Returns a response to short-circuit the handler, or null to continue. */
async function simulateNetwork(scenario: ScenarioName, resource: 'ranking' | 'history' | 'submit') {
  if (scenario === 'timeout') {
    await delay(BEYOND_TIMEOUT_MS)
    return HttpResponse.json({ error: 'Too late' }, { status: 504 })
  }
  await delay(latencyFor(scenario))
  if (scenario === 'network-error') return HttpResponse.error()
  if (scenario === 'offline-at-end' && resource === 'submit') return HttpResponse.error()
  if (scenario === 'http-400') return HttpResponse.json({ error: 'Bad request' }, { status: 400 })
  if (scenario === 'http-500') return HttpResponse.json({ error: 'Internal error' }, { status: 500 })
  if (scenario === 'http-503') return HttpResponse.json({ error: 'Service unavailable' }, { status: 503 })
  if (scenario === 'ranking-fails' && resource === 'ranking') return HttpResponse.json({ error: 'Ranking unavailable' }, { status: 500 })
  if (scenario === 'history-fails' && resource === 'history') return HttpResponse.json({ error: 'History unavailable' }, { status: 500 })
  return null
}

function isValidRecord(value: unknown): value is MatchRecord {
  const r = value as Partial<MatchRecord> | null
  return (
    !!r &&
    typeof r.matchId === 'string' &&
    r.matchId.length > 0 &&
    typeof r.playerId === 'string' &&
    typeof r.playerName === 'string' &&
    typeof r.playedAt === 'string' &&
    !Number.isNaN(Date.parse(r.playedAt)) &&
    Number.isInteger(r.score) &&
    r.score! >= 0 &&
    typeof r.durationSec === 'number' &&
    r.durationSec >= 0 &&
    (r.endReason === 'time_up' || r.endReason === 'destroyed') &&
    !!r.config &&
    typeof r.config.durationSec === 'number' &&
    typeof r.config.spawnIntervalSec === 'number' &&
    r.configKey === configKey(r.config)
  )
}

export const handlers = [
  http.get(`${API}/ranking`, async ({ request }) => {
    const scenario = getScenario()
    const failure = await simulateNetwork(scenario, 'ranking')
    if (failure) return failure
    const url = new URL(request.url)
    const key = url.searchParams.get('configKey')
    if (!key) return HttpResponse.json({ error: 'configKey is required' }, { status: 400 })
    const { page, pageSize } = pageParams(url)

    let records = scenario === 'empty' ? [] : db.all().filter((r) => r.configKey === key)
    if (scenario === 'many-pages') {
      const [durationSec = 120, spawnIntervalSec = 3] = key.split('-').map(Number)
      records = [...records, ...generateRecords(40, { durationSec, spawnIntervalSec }, 99)]
    }
    const sorted = [...records].sort(compareRanking).map((r, i) => ({ ...r, rank: i + 1 }))
    return HttpResponse.json(paginate(sorted, page, pageSize))
  }),

  http.get(`${API}/players/:playerId/matches`, async ({ request, params }) => {
    const scenario = getScenario()
    const failure = await simulateNetwork(scenario, 'history')
    if (failure) return failure
    const playerId = String(params.playerId)
    const { page, pageSize } = pageParams(new URL(request.url))

    let records = scenario === 'empty' ? [] : db.all().filter((r) => r.playerId === playerId)
    if (scenario === 'many-pages') {
      records = [...records, ...generateRecords(23, { durationSec: 120, spawnIntervalSec: 3 }, 77, { playerId, playerName: 'You' })]
    }
    const sorted = [...records].sort((a, b) => b.playedAt.localeCompare(a.playedAt) || a.matchId.localeCompare(b.matchId))
    return HttpResponse.json(paginate(sorted, page, pageSize))
  }),

  http.post(`${API}/matches`, async ({ request }) => {
    const scenario = getScenario()
    const body: unknown = await request.json().catch(() => null)
    if (!isValidRecord(body)) return HttpResponse.json({ error: 'Invalid match record' }, { status: 400 })
    if (request.headers.get('Idempotency-Key') !== body.matchId) {
      return HttpResponse.json({ error: 'Idempotency-Key must match matchId' }, { status: 400 })
    }

    // Idempotency: a resend of a stored match returns the stored record, never a duplicate.
    const existing = db.find(body.matchId)
    if (existing) {
      await delay(latencyFor(scenario === 'post-timeout-after-commit' ? 'success' : scenario))
      return HttpResponse.json(existing, { status: 200 })
    }

    if (scenario === 'post-timeout-after-commit') {
      db.insert(body)
      await delay(BEYOND_TIMEOUT_MS)
      return HttpResponse.json(body, { status: 201 })
    }

    const failure = await simulateNetwork(scenario, 'submit')
    if (failure) return failure
    db.insert(body)
    return HttpResponse.json(body, { status: 201 })
  }),
]
