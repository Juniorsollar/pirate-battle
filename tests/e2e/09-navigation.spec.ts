import { advance, expect, NO_ENEMIES, openApp, pendingMatches, snapshot, startMatch, storedMatches, test, waitForBattle } from './helpers'

test.describe('navigation and abandonment', () => {
  test('leaving or reloading a match abandons it without registering', async ({ page }) => {
    await startMatch(page, { seed: 2 })
    await advance(page, 10)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click()
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)

    await page.getByRole('button', { name: 'Play' }).click()
    await waitForBattle(page)
    await advance(page, 10)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()

    expect(await storedMatches(page)).toBe(0)
    expect(await pendingMatches(page)).toBe(0)
    await expect(page.locator('.last-result')).toHaveCount(0)
  })

  test('repeated navigation between screens keeps a single game instance', async ({ page }) => {
    test.slow()
    await openApp(page)
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Play' }).click()
      await waitForBattle(page)
      await advance(page, 1)
      await expect(page.locator('canvas')).toHaveCount(1)
      await page.getByRole('button', { name: 'Pause' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click()
      await expect(page.locator('canvas')).toHaveCount(0)
      await page.getByRole('button', { name: 'Options' }).click()
      await page.getByRole('button', { name: 'Main Menu' }).click()
      await page.getByRole('button', { name: 'Ranking' }).click()
      await page.getByRole('button', { name: 'Main Menu' }).click()
    }
    expect(await page.evaluate(() => window.__PIRATE_TEST__ ?? null)).toBeNull()
  })

  test('portrait pauses the match and asks to rotate; landscape resumes it', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'orientation applies to touch devices')
    await startMatch(page, { overrides: NO_ENEMIES })
    const landscape = page.viewportSize()!
    await page.setViewportSize({ width: landscape.height, height: landscape.width })

    const dialog = page.getByRole('dialog', { name: 'Paused' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Rotate your device to landscape to keep playing.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Resume' })).toHaveCount(0)
    expect((await snapshot(page)).phase).toBe('paused')
    await page.keyboard.press('Escape')
    expect((await snapshot(page)).phase).toBe('paused') // cannot resume in portrait
    // Nothing of the HUD is cut off in portrait.
    expect(await page.evaluate(() => [...document.querySelectorAll('.hud, .hud *')].every((e) => e.getBoundingClientRect().right <= innerWidth + 0.5))).toBe(true)

    await page.setViewportSize(landscape)
    await dialog.getByRole('button', { name: 'Resume' }).click()
    expect((await snapshot(page)).phase).toBe('running')
  })

  test('touch controls move and fire', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch controls are shown on coarse pointers')
    await startMatch(page, { overrides: NO_ENEMIES })
    const forward = page.getByRole('button', { name: 'Sail forward', includeHidden: true })
    await expect(forward).toBeVisible()
    const start = await snapshot(page)

    const press = async (label: string, seconds: number, pointerId: number) => {
      const button = page.getByRole('button', { name: label, includeHidden: true })
      await button.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1 })
      await advance(page, seconds)
      await button.dispatchEvent('pointerup', { pointerId, pointerType: 'touch' })
    }

    await press('Sail forward', 1, 1)
    const moved = await snapshot(page)
    expect(start.player.y - moved.player.y).toBeCloseTo(170, 0)

    // Two fingers at once: turn and fire simultaneously.
    const turn = page.getByRole('button', { name: 'Turn right', includeHidden: true })
    const fire = page.getByRole('button', { name: 'Fire bow cannon', includeHidden: true })
    await turn.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch' })
    await fire.dispatchEvent('pointerdown', { pointerId: 3, pointerType: 'touch' })
    await advance(page, 0.5)
    await turn.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch' })
    await fire.dispatchEvent('pointerup', { pointerId: 3, pointerType: 'touch' })
    const after = await snapshot(page)
    expect(after.player.angle - moved.player.angle).toBeCloseTo(1.3, 2)
    expect(after.stats.playerShots).toBe(2)

    await press('Fire left broadside', 1 / 60, 4)
    expect((await snapshot(page)).stats.playerShots).toBe(5)
  })
})
