import { advance, expect, NO_ENEMIES, snapshot, startMatch, test } from './helpers'

test.describe('combat', () => {
  test('bow cannon fires a single forward shot and respects its cooldown', async ({ page }) => {
    await startMatch(page, { overrides: NO_ENEMIES })
    await page.keyboard.down('Space')
    await advance(page, 1 / 60)
    const first = await snapshot(page)
    expect(first.projectiles).toHaveLength(1)
    expect(first.projectiles[0]!.vx).toBeCloseTo(0, 3)
    expect(first.projectiles[0]!.vy).toBeCloseTo(-620, 3) // facing up at projectileSpeed

    // Holding fire for one second: shots at 0 s, ~0.45 s and ~0.9 s only.
    await advance(page, 1 - 1 / 60)
    await page.keyboard.up('Space')
    expect((await snapshot(page)).stats.playerShots).toBe(3)
  })

  test('broadsides fire three parallel shots to each side', async ({ page }) => {
    await startMatch(page, { overrides: NO_ENEMIES })
    await page.keyboard.down('KeyQ')
    await advance(page, 1 / 60)
    await page.keyboard.up('KeyQ')
    const left = (await snapshot(page)).projectiles
    expect(left).toHaveLength(3)
    for (const p of left) {
      expect(p.vx).toBeCloseTo(-540, 3)
      expect(p.vy).toBeCloseTo(0, 3)
      expect(p.x).toBeCloseTo(left[0]!.x, 3)
    }
    expect(new Set(left.map((p) => Math.round(p.y))).size).toBe(3)

    // Shared broadside cooldown (1.2 s): pressing E right away does nothing.
    await page.keyboard.down('KeyE')
    await advance(page, 0.5)
    expect((await snapshot(page)).stats.playerShots).toBe(3)
    await advance(page, 0.8)
    await page.keyboard.up('KeyE')
    const right = (await snapshot(page)).projectiles.filter((p) => p.vx > 0)
    expect(right).toHaveLength(3)
    for (const p of right) expect(p.vx).toBeCloseTo(540, 3)
  })

  test('each hit damages once and every kill scores exactly one point', async ({ page }) => {
    await startMatch(page, { seed: 3 })
    // Aim-and-fire autopilot driving the real keyboard controls.
    const result = await page.evaluate(() => {
      const g = window.__PIRATE_TEST__!
      const s = g.sim
      const held = new Set<string>()
      const key = (code: string, on: boolean) => {
        if (on === held.has(code)) return
        if (on) held.add(code)
        else held.delete(code)
        window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code }))
      }
      let firstHit: { health: number; maxHealth: number } | null = null
      let trackedId = -1
      let healthBefore = 0
      for (let i = 0; i < 60 * 60 && s.status === 'running' && s.stats.kills < 4; i++) {
        const p = s.player
        const target = s.enemies.reduce<(typeof s.enemies)[number] | null>(
          (best, e) => (!best || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? e : best),
          null,
        )
        if (target) {
          let d = Math.atan2(target.y - p.y, target.x - p.x) - p.angle
          d = Math.atan2(Math.sin(d), Math.cos(d))
          key('KeyD', d > 0.05)
          key('KeyA', d < -0.05)
          key('Space', Math.abs(d) < 0.2)
          if (s.stats.playerHits === 0) {
            trackedId = target.id
            healthBefore = target.health
          }
        }
        const hitsBefore = s.stats.playerHits
        g.advance(1 / 60)
        if (!firstHit && hitsBefore === 0 && s.stats.playerHits === 1) {
          const tracked = s.enemies.find((e) => e.id === trackedId)
          if (tracked) firstHit = { health: healthBefore - tracked.health, maxHealth: tracked.maxHealth }
        }
      }
      for (const code of [...held]) key(code, false)
      return { firstHit, score: s.score, kills: s.stats.kills, hits: s.stats.playerHits }
    })
    expect(result.firstHit?.health).toBe(25) // bow cannon damage, applied once
    expect(result.kills).toBeGreaterThanOrEqual(2)
    expect(result.score).toBe(result.kills)
    await expect(page.getByLabel(`Score ${result.score}`)).toBeVisible()
  })
})
