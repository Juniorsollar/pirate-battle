import { expect, finishMatch, NO_ENEMIES, openApp, pendingMatches, startMatch, storedMatches, test } from './helpers'

test.describe('resilience', () => {
  test('a timeout after the server stored the match recovers without duplicates', async ({ page }) => {
    await startMatch(page, { scenario: 'post-timeout-after-commit', overrides: NO_ENEMIES })
    await finishMatch(page)
    await expect(page.getByText('Saving battle…')).toBeVisible()
    await expect(page.getByText('Battle saved to the Captain’s Log.')).toBeVisible({ timeout: 20_000 })
    expect(await storedMatches(page)).toBe(1)
    expect(await pendingMatches(page)).toBe(0)
  })

  test('repeated retries of the same match never duplicate it', async ({ page }) => {
    await startMatch(page, { scenario: 'offline-at-end', overrides: NO_ENEMIES })
    await finishMatch(page)
    const retry = page.getByRole('button', { name: 'Retry save' })
    await expect(retry).toBeVisible({ timeout: 10_000 })

    // Server stores on the first attempt but answers too late; the user keeps clicking.
    await page.evaluate(() => localStorage.setItem('pirate-battle:scenario:v1', 'post-timeout-after-commit'))
    await retry.click()
    await retry.click({ timeout: 1000 }).catch(() => undefined)
    await retry.click({ timeout: 1000 }).catch(() => undefined)
    await expect(page.getByText('Battle saved to the Captain’s Log.')).toBeVisible({ timeout: 20_000 })
    expect(await storedMatches(page)).toBe(1)

    await page.getByRole('button', { name: 'Main Menu' }).click()
    await page.getByRole('button', { name: 'Match History' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })

  test('late responses never overwrite newer data', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Ranking' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(5)

    // Odd requests take 2.5 s, even ones 200 ms: page 2 answers after page 3.
    await page.evaluate(() => localStorage.setItem('pirate-battle:scenario:v1', 'out-of-order'))
    await page.getByRole('button', { name: 'Next page' }).click()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.locator('tbody tr').first().locator('td').first()).toHaveText('11')
    await page.waitForTimeout(3000) // let the slow page-2 response arrive
    await expect(page.locator('.pagination')).toContainText('Page 3 of 3')
    await expect(page.locator('tbody tr').first().locator('td').first()).toHaveText('11')
  })
})
