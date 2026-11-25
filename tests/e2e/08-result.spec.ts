import { expect, finishMatch, NO_ENEMIES, startMatch, test } from './helpers'

test('result shows score, time, reason and registration status, and survives a refresh', async ({ page }) => {
  await startMatch(page, { overrides: NO_ENEMIES })
  await finishMatch(page)

  const check = async () => {
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.getByLabel('0 points')).toBeVisible()
    const details = page.locator('.result-details')
    await expect(details).toContainText('Points')
    await expect(details).toContainText('02:00')
    await expect(details).toContainText('Time up')
    await expect(page.getByText('Battle saved to the Captain’s Log.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible()
  }
  await check()
  await page.reload()
  await check()

  await page.getByRole('button', { name: 'Main Menu' }).click()
  await expect(page.locator('.last-result')).toContainText('0 points · 02:00 · Time up')
})
