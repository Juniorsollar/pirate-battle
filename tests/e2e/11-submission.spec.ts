import { expect, finishMatch, NO_ENEMIES, pendingMatches, snapshot, startMatch, storedMatches, test, waitForBattle } from './helpers'

test.describe('match registration', () => {
  test('a finished match is registered once and shows up in both tabs', async ({ page }) => {
    await startMatch(page, { overrides: NO_ENEMIES })
    await finishMatch(page)
    await expect(page.getByText('Battle saved to the Captain’s Log.')).toBeVisible()
    expect(await storedMatches(page)).toBe(1)

    await page.getByRole('button', { name: 'Main Menu' }).click()
    await page.getByRole('button', { name: 'Match History' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr')).toContainText('02:00')
    await expect(page.locator('tbody tr')).toContainText('Time up')

    // Score 0 ranks last: page 3 of the 120-3 ranking now has the player's entry.
    await page.getByRole('tab', { name: 'Ranking' }).click()
    await page.getByRole('button', { name: 'Next page' }).click()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.locator('tr.is-you')).toHaveCount(1)
    await expect(page.locator('tr.is-you')).toContainText('You')
  })

  test('a match that could not be saved survives a refresh and is sent after recovery', async ({ page }) => {
    await startMatch(page, { scenario: 'offline-at-end', overrides: NO_ENEMIES })
    await finishMatch(page)
    await expect(page.getByText(/Battle not saved yet/)).toBeVisible({ timeout: 10_000 })
    expect(await pendingMatches(page)).toBe(1)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.getByText(/Battle not saved yet|Saving battle/)).toBeVisible()

    // Another match can start while the registration is pending.
    await page.getByRole('button', { name: 'Play Again' }).click()
    await waitForBattle(page)
    expect((await snapshot(page)).phase).toBe('running')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click()
    await expect(page.locator('.pending')).toContainText('1 battle waiting to be saved.')

    await page.getByText('Network scenarios (demo)').click()
    await page.getByLabel('Mock API behaviour').selectOption('instant')
    await expect(page.locator('.pending')).toHaveCount(0)
    expect(await storedMatches(page)).toBe(1)
    await page.getByRole('button', { name: 'Match History' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })
})
