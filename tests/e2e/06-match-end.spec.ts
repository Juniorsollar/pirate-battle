import { advance, expect, finishMatch, hold, NO_ENEMIES, snapshot, startMatch, test, waitForBattle } from './helpers'

test.describe('match end', () => {
  test('ends when time runs out and freezes the simulation', async ({ page }) => {
    await startMatch(page, { overrides: NO_ENEMIES })
    await advance(page, 119.5)
    expect((await snapshot(page)).status).toBe('running')
    await hold(page, 'KeyW', 0.1)

    // End and post-end checks in one evaluation: the result screen replaces the session right after.
    const result = await page.evaluate(() => {
      const g = window.__PIRATE_TEST__!
      const s = g.sim
      g.advance(0.6)
      const ended = { status: s.status, reason: s.endReason, elapsed: s.elapsed, x: s.player.x, y: s.player.y, shots: s.stats.playerShots, spawns: s.spawnCount }
      // Nothing moves, fires, spawns or advances after the end, even with controls held.
      for (const code of ['KeyW', 'KeyD', 'Space', 'KeyQ']) window.dispatchEvent(new KeyboardEvent('keydown', { code }))
      for (let i = 0; i < 120; i++) s.step(1 / 60, { forward: true, turnLeft: false, turnRight: true, fireFront: true, fireLeft: true, fireRight: false })
      g.advance(3)
      const after = { status: s.status, reason: s.endReason, elapsed: s.elapsed, x: s.player.x, y: s.player.y, shots: s.stats.playerShots, spawns: s.spawnCount }
      return { ended, after }
    })
    expect(result.ended.status).toBe('ended')
    expect(result.ended.reason).toBe('time_up')
    expect(result.ended.elapsed).toBeCloseTo(120, 1)
    expect(result.after).toEqual(result.ended)

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.locator('.result-details')).toContainText('02:00')
    await expect(page.locator('.result-details')).toContainText('Time up')
  })

  test('ends when the ship is destroyed', async ({ page }) => {
    await startMatch(page, { seed: 7 })
    await finishMatch(page)
    await expect(page.getByRole('heading', { name: 'Ship sunk' })).toBeVisible()
    await expect(page.locator('.result-details')).toContainText('Ship destroyed')
  })

  test('play again starts a clean match', async ({ page }) => {
    await startMatch(page, { seed: 7 })
    await finishMatch(page)
    await page.getByRole('button', { name: 'Play Again' }).click()
    await waitForBattle(page)
    const fresh = await snapshot(page)
    expect(fresh).toMatchObject({ phase: 'running', elapsed: 0, score: 0, spawnCount: 0, enemies: [], projectiles: [] })
    expect(fresh.player.health).toBe(100)
    expect(fresh.hud.timeLeft).toBe(120)
    await expect(page.locator('canvas')).toHaveCount(1)
  })
})
