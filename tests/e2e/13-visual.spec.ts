import { advance, expect, finishMatch, NO_ENEMIES, openApp, settleVisuals, startMatch, test } from './helpers'

test.describe('visual regression', () => {
  test('main menu', async ({ page }) => {
    await openApp(page)
    await settleVisuals(page)
    await expect(page).toHaveScreenshot('menu.png')
  })

  test('arena in a stable state', async ({ page }) => {
    // Fixed seed + manual clock: the frame only depends on the rules.
    await startMatch(page, { seed: 1 })
    await advance(page, 4)
    await expect(page.locator('.hud')).toBeVisible()
    await settleVisuals(page)
    await expect(page).toHaveScreenshot('arena.png')
  })

  test('result screen', async ({ page }) => {
    await startMatch(page, { overrides: NO_ENEMIES })
    await finishMatch(page)
    await expect(page.getByText('Battle saved to the Captain’s Log.')).toBeVisible()
    await settleVisuals(page)
    await expect(page).toHaveScreenshot('result.png')
  })
})
