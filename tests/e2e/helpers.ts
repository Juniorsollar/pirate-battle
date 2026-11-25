import { test as base, expect, type Page } from '@playwright/test'

/** Shape of the test instrumentation exposed by the app with `?test` (see src/ui/MatchScreen.tsx). */
interface ShipState {
  id: number
  kind: 'player' | 'chaser' | 'shooter'
  x: number
  y: number
  angle: number
  health: number
  maxHealth: number
  radius: number
  alive: boolean
}
interface ProjectileState {
  id: number
  faction: 'player' | 'enemy'
  x: number
  y: number
  vx: number
  vy: number
}
interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface TestHook {
  sim: {
    player: ShipState
    enemies: ShipState[]
    projectiles: ProjectileState[]
    islands: Rect[]
    elapsed: number
    score: number
    status: 'running' | 'ended'
    endReason: 'time_up' | 'destroyed' | null
    spawnCount: number
    step(dt: number, input: Record<string, boolean>): void
    timeLeft: number
    stats: { playerShots: number; enemyShots: number; playerHits: number; enemyHits: number; kills: number; chaserImpacts: number }
    config: { arena: { width: number; height: number }; shooter: { attackRange: number }; player: { moveSpeed: number; turnSpeed: number } }
  }
  store: { get(): { phase: 'running' | 'paused' | 'ended'; health: number; score: number; timeLeft: number } }
  advance(seconds: number): void
  pause(): void
  resume(): void
}

declare global {
  interface Window {
    __PIRATE_TEST__?: TestHook | null
  }
}

/** Browser network logs for failures we simulate on purpose (MSW 5xx, aborted asset requests). */
const EXPECTED_CONSOLE = /^Failed to load resource/

/** Every test fails if the page logs an unexpected console error or throws. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error' && !EXPECTED_CONSOLE.test(message.text())) errors.push(message.text())
      })
      await use(errors)
      expect(errors, 'unexpected console errors').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

export const NO_ENEMIES = { session: { maxEnemies: 0 } }

export interface AppParams {
  scenario?: string
  seed?: number
  manualClock?: boolean
  overrides?: object
}

export function appUrl({ scenario = 'instant', seed = 1, manualClock = true, overrides }: AppParams = {}) {
  const params = new URLSearchParams({ test: '', scenario, seed: String(seed) })
  if (manualClock) params.set('manualClock', '')
  if (overrides) params.set('overrides', JSON.stringify(overrides))
  return `/?${params.toString()}`
}

export async function openApp(page: Page, params: AppParams = {}) {
  await page.goto(appUrl(params))
  // First load registers the MSW service worker, which can be slow under parallel load.
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 20_000 })
}

export async function waitForBattle(page: Page) {
  await page.waitForFunction(() => !!window.__PIRATE_TEST__?.sim && !!document.querySelector('.arena canvas'))
}

export async function startMatch(page: Page, params: AppParams = {}) {
  await openApp(page, params)
  await page.getByRole('button', { name: 'Play' }).click()
  await waitForBattle(page)
}

/** Runs `seconds` of game time through the real fixed-step loop (manual clock). */
export function advance(page: Page, seconds: number) {
  return page.evaluate((s) => window.__PIRATE_TEST__!.advance(s), seconds)
}

/** Holds a real key while game time advances. */
export async function hold(page: Page, key: string, seconds: number) {
  await page.keyboard.down(key)
  await advance(page, seconds)
  await page.keyboard.up(key)
}

export function snapshot(page: Page) {
  return page.evaluate(() => {
    const g = window.__PIRATE_TEST__!
    const s = g.sim
    const ship = (e: ShipState) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, angle: e.angle, health: e.health, alive: e.alive, radius: e.radius })
    return {
      phase: g.store.get().phase,
      hud: g.store.get(),
      elapsed: s.elapsed,
      score: s.score,
      status: s.status,
      endReason: s.endReason,
      spawnCount: s.spawnCount,
      stats: { ...s.stats },
      player: ship(s.player),
      enemies: s.enemies.map(ship),
      projectiles: s.projectiles.map((p) => ({ ...p })),
    }
  })
}

/** Plays until the match ends (time or death) with the real rules. */
export async function finishMatch(page: Page) {
  await page.evaluate(() => {
    const g = window.__PIRATE_TEST__!
    for (let i = 0; i < 400 && g.sim.status === 'running'; i++) g.advance(1)
  })
  await expect(page.locator('#result-title')).toBeVisible()
}

/** Matches stored by the mock API for this browser (fixtures excluded). */
export function storedMatches(page: Page) {
  return page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('pirate-battle:mockdb:v1') ?? '[]') as { matchId: string }[]).filter(
        (r) => !r.matchId.startsWith('fixture'),
      ).length,
  )
}

export function pendingMatches(page: Page) {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('pirate-battle:pending-matches:v1') ?? '[]') as unknown[]).length)
}

/** Waits until every image used by the page (including CSS backgrounds/border images) is decoded. */
export async function settleVisuals(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    const urls = new Set<string>()
    for (const el of document.querySelectorAll('*')) {
      const style = getComputedStyle(el)
      for (const value of [style.backgroundImage, style.borderImageSource]) {
        for (const match of value.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(match[1]!)
      }
    }
    for (const img of document.images) urls.add(img.src)
    await Promise.all(
      [...urls].map((src) => {
        const image = new Image()
        image.src = src
        return image.decode().catch(() => undefined)
      }),
    )
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}
