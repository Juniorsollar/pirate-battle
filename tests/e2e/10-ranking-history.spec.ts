import { expect, openApp, test } from './helpers'

const pageLabel = (page: import('@playwright/test').Page, text: string) => page.locator('.pagination').getByText(text, { exact: true })

test.describe('ranking and match history', () => {
  test('ranking is paginated, ordered by score and scoped to the current configuration', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Ranking' }).click()
    await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('120 second battles · 3 second spawn interval')).toBeVisible()
    await expect(pageLabel(page, 'Page 1 of 3')).toBeVisible()
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(5)
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    const points = await page.locator('tbody .points').allInnerTexts()
    expect(points.map(Number)).toEqual([...points.map(Number)].sort((a, b) => b - a))

    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(pageLabel(page, 'Page 2 of 3')).toBeVisible()
    await expect(rows.first().locator('td').first()).toHaveText('06')
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(pageLabel(page, 'Page 3 of 3')).toBeVisible()
    await expect(rows).toHaveCount(4)
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()

    // Tabs switch with the arrow keys.
    await page.getByRole('tab', { name: 'Ranking' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Match History' })).toBeFocused()
    await expect(page.getByText('No battles yet. Finish a match to fill your log.')).toBeVisible()
  })

  test('shows a loading state while slow requests are in flight', async ({ page }) => {
    await openApp(page, { scenario: 'slow' })
    await page.getByRole('button', { name: 'Ranking' }).click()
    await expect(page.getByText('Loading ranking…')).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(5, { timeout: 10_000 })
  })

  test('shows empty states', async ({ page }) => {
    await openApp(page, { scenario: 'empty' })
    await page.getByRole('button', { name: 'Ranking' }).click()
    await expect(page.getByText('No battles with this configuration yet. Be the first!')).toBeVisible()
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(page.getByText('No battles yet. Finish a match to fill your log.')).toBeVisible()
  })

  test('shows errors with a retry when ranking or history fail', async ({ page }) => {
    await openApp(page, { scenario: 'ranking-fails' })
    await page.getByRole('button', { name: 'Ranking' }).click()
    await expect(page.getByRole('alert')).toContainText('Could not load the ranking. The server answered with an error (500).')
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(page.getByText('No battles yet. Finish a match to fill your log.')).toBeVisible()

    // Recovery: switch the scenario back and retry.
    await page.evaluate(() => localStorage.setItem('pirate-battle:scenario:v1', 'instant'))
    await page.getByRole('tab', { name: 'Ranking' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(5)

    // With cached data, a failed refresh keeps the data and says so; without cache it is an error.
    await page.evaluate(() => localStorage.setItem('pirate-battle:scenario:v1', 'history-fails'))
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(page.getByText('Showing saved data: the latest update failed.')).toBeVisible({ timeout: 10_000 })

    await openApp(page, { scenario: 'history-fails' })
    await page.getByRole('button', { name: 'Match History' }).click()
    await expect(page.getByRole('alert')).toContainText('Could not load the match history', { timeout: 10_000 })
    await page.evaluate(() => localStorage.setItem('pirate-battle:scenario:v1', 'instant'))
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('No battles yet. Finish a match to fill your log.')).toBeVisible()
  })

  test('handles many pages and connection failures', async ({ page }) => {
    await openApp(page, { scenario: 'many-pages' })
    await page.getByRole('button', { name: 'Ranking' }).click()
    await expect(pageLabel(page, 'Page 1 of 11')).toBeVisible()
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(pageLabel(page, 'Page 1 of 5')).toBeVisible()

    await openApp(page, { scenario: 'network-error' })
    await page.getByRole('button', { name: 'Match History' }).click()
    await expect(page.getByRole('alert')).toContainText('Could not reach the server.', { timeout: 10_000 })
  })
})
