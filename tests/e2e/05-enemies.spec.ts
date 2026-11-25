import { advance, expect, snapshot, startMatch, test } from './helpers'

test.describe('enemies', () => {
  test('spawn on the configured interval, away from the player and islands, with both types', async ({ page }) => {
    await startMatch(page, { seed: 4 })
    await advance(page, 2.9)
    expect((await snapshot(page)).spawnCount).toBe(0)
    await advance(page, 0.2)
    let s = await snapshot(page)
    expect(s.spawnCount).toBe(1)
    expect(s.enemies[0]!.kind).toBe('chaser')
    await advance(page, 3)
    s = await snapshot(page)
    expect(s.spawnCount).toBe(2)
    expect(s.enemies.map((e) => e.kind)).toContain('shooter')

    const check = await page.evaluate(() => {
      const g = window.__PIRATE_TEST__!
      const s = g.sim
      const spawnedAt: { distance: number; overlapsIsland: boolean }[] = []
      const seen = new Set(s.enemies.map((e) => e.id))
      for (let i = 0; i < 60 * 30 && s.status === 'running'; i++) {
        g.advance(1 / 60)
        for (const e of s.enemies) {
          if (seen.has(e.id)) continue
          seen.add(e.id)
          const overlapsIsland = s.islands.some((r) => {
            const dx = e.x - Math.max(r.x, Math.min(e.x, r.x + r.w))
            const dy = e.y - Math.max(r.y, Math.min(e.y, r.y + r.h))
            return Math.hypot(dx, dy) < e.radius
          })
          spawnedAt.push({ distance: Math.hypot(e.x - s.player.x, e.y - s.player.y), overlapsIsland })
        }
      }
      return spawnedAt
    })
    expect(check.length).toBeGreaterThanOrEqual(3)
    for (const spawn of check) {
      expect(spawn.overlapsIsland).toBe(false)
      expect(spawn.distance).toBeGreaterThanOrEqual(260)
    }
  })

  test('chaser pursues, explodes on impact and does not score', async ({ page }) => {
    await startMatch(page, { seed: 5, overrides: { session: { maxEnemies: 1 } } })
    await advance(page, 3.05)
    const spawned = await snapshot(page)
    const chaser = spawned.enemies[0]!
    expect(chaser.kind).toBe('chaser')
    const startDistance = Math.hypot(chaser.x - spawned.player.x, chaser.y - spawned.player.y)
    await advance(page, 1)
    const closer = await snapshot(page)
    const c = closer.enemies[0]!
    expect(Math.hypot(c.x - closer.player.x, c.y - closer.player.y)).toBeLessThan(startDistance)

    const impact = await page.evaluate(() => {
      const g = window.__PIRATE_TEST__!
      const s = g.sim
      for (let i = 0; i < 60 * 20 && s.stats.chaserImpacts === 0; i++) g.advance(1 / 60)
      return { impacts: s.stats.chaserImpacts, health: s.player.health, score: s.score, chaserAlive: s.enemies.some((e) => e.kind === 'chaser') }
    })
    expect(impact).toEqual({ impacts: 1, health: 80, score: 0, chaserAlive: false })
  })

  test('shooter approaches and only fires within attack range', async ({ page }) => {
    // One enemy at a time: the first (chaser) crashes, the second spawn is a shooter.
    await startMatch(page, { seed: 6, overrides: { session: { maxEnemies: 1 } } })
    const result = await page.evaluate(() => {
      const g = window.__PIRATE_TEST__!
      const s = g.sim
      const range = s.config.shooter.attackRange
      const shotDistances: number[] = []
      let lastShots = 0
      let shooterSeen = false
      for (let i = 0; i < 60 * 40 && s.status === 'running' && shotDistances.length < 3; i++) {
        g.advance(1 / 60)
        const shooter = s.enemies.find((e) => e.kind === 'shooter')
        if (shooter) shooterSeen = true
        if (s.stats.enemyShots > lastShots && shooter) shotDistances.push(Math.hypot(shooter.x - s.player.x, shooter.y - s.player.y))
        lastShots = s.stats.enemyShots
      }
      return { shooterSeen, shotDistances, range }
    })
    expect(result.shooterSeen).toBe(true)
    expect(result.shotDistances.length).toBeGreaterThan(0)
    for (const d of result.shotDistances) expect(d).toBeLessThanOrEqual(result.range + 1)
  })
})
