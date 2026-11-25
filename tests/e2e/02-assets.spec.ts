import { appUrl, expect, test, waitForBattle } from './helpers'

// Note: page.route() cannot intercept requests that go through the MSW service worker,
// so the app's test-only `failAssetsOnce` flag requests a missing file on the first attempt
// (a real failed network load) and the real URL on retry.
test('shows loading progress, reports asset failures and recovers on retry', async ({ page }) => {
  await page.goto(`${appUrl()}&failAssetsOnce`)
  await page.evaluate(() => {
    const w = window as Window & { sawProgress?: boolean }
    new MutationObserver(() => {
      if (document.querySelector('progress')) w.sawProgress = true
    }).observe(document.body, { childList: true, subtree: true })
  })
  await page.getByRole('button', { name: 'Play' }).click()

  await expect(page.getByRole('alert')).toContainText('could not be loaded', { timeout: 15_000 })
  await expect(page.locator('.arena canvas')).toHaveCount(0)
  expect(await page.evaluate(() => (window as Window & { sawProgress?: boolean }).sawProgress)).toBe(true)

  await page.getByRole('button', { name: 'Retry' }).click()
  await waitForBattle(page)
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
})
