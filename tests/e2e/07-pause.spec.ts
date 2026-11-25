import { expect, NO_ENEMIES, snapshot, startMatch, test } from './helpers'

// Real clock here: pausing must stop time that would otherwise pass.
test.describe('pause', () => {
  test('pauses on focus loss and resumes only on player action without time jumps', async ({ page }) => {
    await startMatch(page, { manualClock: false, overrides: NO_ENEMIES })
    await expect.poll(async () => (await snapshot(page)).elapsed).toBeGreaterThan(0.2)

    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    const dialog = page.getByRole('dialog', { name: 'Paused' })
    await expect(dialog).toBeVisible()
    const paused = await snapshot(page)
    expect(paused.phase).toBe('paused')

    // Time, cooldowns and input are frozen while paused.
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(1500)
    await page.keyboard.up('KeyW')
    const still = await snapshot(page)
    expect(still.elapsed).toBe(paused.elapsed)
    expect(still.player).toEqual(paused.player)

    const resumedAt = await page.evaluate(() => performance.now())
    await dialog.getByRole('button', { name: 'Resume' }).click()
    await expect(dialog).toBeHidden()
    await page.waitForTimeout(500)
    const resumed = await snapshot(page)
    const realSeconds = ((await page.evaluate(() => performance.now())) - resumedAt) / 1000
    expect(resumed.phase).toBe('running')
    expect(resumed.elapsed).toBeGreaterThan(paused.elapsed)
    // Game time after resuming never exceeds the real time since the click: the pause is not caught up.
    expect(resumed.elapsed - paused.elapsed).toBeLessThanOrEqual(realSeconds + 0.05)
    expect(resumed.player.y).toBe(paused.player.y) // held key during pause was not applied
  })

  test('pauses when the tab is hidden and with the Escape key', async ({ page }) => {
    await startMatch(page, { overrides: NO_ENEMIES })
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect((await snapshot(page)).phase).toBe('paused')
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect((await snapshot(page)).phase).toBe('paused') // returning does not resume by itself

    await page.keyboard.press('Escape') // closes the dialog = resume
    expect((await snapshot(page)).phase).toBe('running')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused()
  })
})
