import { advance, expect, openApp, snapshot, test, waitForBattle } from './helpers'

test.describe('options', () => {
  test('validates, saves, persists after refresh and is used by the next match', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Options' }).click()
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible()

    const session = page.getByRole('spinbutton', { name: 'Game session time' })
    const spawn = page.getByRole('spinbutton', { name: 'Enemy spawn time' })
    await expect(session).toHaveValue('120')
    await expect(spawn).toHaveValue('3')

    // Invalid values are rejected with accessible errors and nothing is stored.
    await session.fill('500')
    await spawn.fill('0')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Must be between 60 and 180 seconds.')).toBeVisible()
    await expect(page.getByText('Must be between 1 and 10 seconds.')).toBeVisible()
    await expect(session).toHaveAttribute('aria-invalid', 'true')
    expect(await page.evaluate(() => localStorage.getItem('pirate-battle:options:v1'))).toBeNull()

    await session.fill('')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Enter a number.')).toBeVisible()

    // Steppers respect the limits.
    await session.fill('170')
    await page.getByRole('button', { name: 'Increase game session time' }).click()
    await page.getByRole('button', { name: 'Increase game session time' }).click()
    await expect(session).toHaveValue('180')
    await page.getByRole('button', { name: 'Decrease game session time' }).click()
    await page.getByRole('button', { name: 'Decrease game session time' }).click()
    await page.getByRole('button', { name: 'Decrease game session time' }).click()
    await expect(session).toHaveValue('150')
    await spawn.fill('5')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Options saved.' })).toBeVisible()

    await page.reload()
    await page.getByRole('button', { name: 'Options' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Game session time' })).toHaveValue('150')
    await expect(page.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('5')

    // The next match uses the saved configuration.
    await page.getByRole('button', { name: 'Main Menu' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    await waitForBattle(page)
    expect((await snapshot(page)).hud.timeLeft).toBe(150)
    await advance(page, 4.9)
    expect((await snapshot(page)).spawnCount).toBe(0)
    await advance(page, 0.2)
    expect((await snapshot(page)).spawnCount).toBe(1)
  })

  test('menus are keyboard navigable', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('button', { name: 'Play' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Options' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible()
  })
})
