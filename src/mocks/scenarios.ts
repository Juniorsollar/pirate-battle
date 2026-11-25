import { createRng } from '../game/sim/rng'

/** Reproducible network conditions for the mock ranking/history API. */
export const SCENARIOS = {
  success: 'Success (short latency)',
  instant: 'Success (no latency, used by tests)',
  empty: 'Empty lists',
  'many-pages': 'Many pages',
  slow: 'Slow (3 s)',
  jitter: 'Variable latency (0.1–2.5 s, seeded)',
  'out-of-order': 'Out-of-order responses',
  timeout: 'Timeout on every request',
  'network-error': 'Connection failure',
  'http-400': 'HTTP 400 on every request',
  'http-500': 'HTTP 500 on every request',
  'http-503': 'HTTP 503 on every request',
  'ranking-fails': 'Ranking fails (500)',
  'history-fails': 'Match history fails (500)',
  'post-timeout-after-commit': 'Save times out after storing the match',
  'offline-at-end': 'Save unavailable (connection failure)',
} as const

export type ScenarioName = keyof typeof SCENARIOS

const STORAGE_KEY = 'pirate-battle:scenario:v1'
const DEFAULT_SCENARIO: ScenarioName = 'success'

export function isScenario(value: unknown): value is ScenarioName {
  return typeof value === 'string' && value in SCENARIOS
}

export function getScenario(): ScenarioName {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isScenario(stored) ? stored : DEFAULT_SCENARIO
}

export function setScenario(name: ScenarioName) {
  localStorage.setItem(STORAGE_KEY, name)
  window.dispatchEvent(new CustomEvent('scenario-change', { detail: name }))
}

/** `?scenario=<name>` in the URL selects a scenario on load (handy for demos and tests). */
export function applyScenarioFromUrl() {
  const fromUrl = new URLSearchParams(location.search).get('scenario')
  if (isScenario(fromUrl)) localStorage.setItem(STORAGE_KEY, fromUrl)
}

let requestCount = 0
let rng = createRng(42)

export function resetNetworkRandomness() {
  requestCount = 0
  rng = createRng(42)
}

/** Latency for the next request of the given scenario, in ms. */
export function latencyFor(scenario: ScenarioName): number {
  requestCount += 1
  switch (scenario) {
    case 'instant':
      return 0
    case 'slow':
      return 3000
    case 'jitter':
      return 100 + Math.floor(rng() * 2400)
    // Odd requests are slow, even ones fast: a later request answers before an earlier one.
    case 'out-of-order':
      return requestCount % 2 === 1 ? 2500 : 200
    default:
      return 250
  }
}
