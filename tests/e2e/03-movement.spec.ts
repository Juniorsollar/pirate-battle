import { expect, hold, NO_ENEMIES, snapshot, startMatch, test } from './helpers'

test.describe('movement', () => {
  test.beforeEach(async ({ page }) => {
    await startMatch(page, { overrides: NO_ENEMIES })
  })

  test('sails forward and rotates both ways, independent of frame rate', async ({ page }) => {
    const start = await snapshot(page)
    expect(start.phase).toBe('running')
    expect(start.player.angle).toBeCloseTo(-Math.PI / 2)

    await hold(page, 'KeyW', 1)
    const moved = await snapshot(page)
    expect(moved.player.x).toBeCloseTo(start.player.x, 3)
    expect(start.player.y - moved.player.y).toBeCloseTo(170, 0) // moveSpeed px/s

    await hold(page, 'KeyD', 0.5)
    const right = await snapshot(page)
    expect(right.player.angle - moved.player.angle).toBeCloseTo(1.3, 2) // turnSpeed 2.6 rad/s
    await hold(page, 'ArrowLeft', 0.5)
    expect((await snapshot(page)).player.angle).toBeCloseTo(moved.player.angle, 2)
  })

  test('cannot leave the arena', async ({ page }) => {
    await hold(page, 'ArrowUp', 6)
    const s = await snapshot(page)
    expect(s.player.y).toBeCloseTo(s.player.radius, 3)
  })

  test('islands block the ship', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = window.__PIRATE_TEST__!
      const { player, islands } = g.sim
      const island = islands[2]! // sand island south-west of the start position
      const target = Math.atan2(island.y + island.h / 2 - player.y, island.x + island.w / 2 - player.x)
      return { target, start: player.angle }
    })
    // Turn left towards the island using the real controls.
    let delta = result.target - result.start
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    await hold(page, delta < 0 ? 'KeyA' : 'KeyD', Math.abs(delta) / 2.6)

    await page.keyboard.down('KeyW')
    const contact = await page.evaluate(() => {
      const g = window.__PIRATE_TEST__!
      const p = g.sim.player
      const r = g.sim.islands[2]!
      let minDistance = Infinity
      for (let i = 0; i < 60 * 6; i++) {
        g.advance(1 / 60)
        const dx = p.x - Math.max(r.x, Math.min(p.x, r.x + r.w))
        const dy = p.y - Math.max(r.y, Math.min(p.y, r.y + r.h))
        minDistance = Math.min(minDistance, Math.hypot(dx, dy))
      }
      return { minDistance, radius: p.radius }
    })
    await page.keyboard.up('KeyW')
    // Touched the island but never overlapped it.
    expect(contact.minDistance).toBeGreaterThanOrEqual(contact.radius - 0.01)
    expect(contact.minDistance).toBeLessThan(contact.radius + 1)
  })
})
