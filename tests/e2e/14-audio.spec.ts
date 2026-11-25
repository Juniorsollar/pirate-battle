import { advance, appUrl, expect, NO_ENEMIES, test, waitForBattle } from './helpers'

type Played = Record<string, number | undefined>
const played = (page: import('@playwright/test').Page) => page.evaluate(() => ({ ...(window.__PIRATE_AUDIO__!.played as Played) }))

declare global {
  interface Window {
    __PIRATE_AUDIO__?: { played: Played; ready(): Promise<void> }
  }
}

// Audio is off in tests unless `?sound` is present.
test('game events play sounds and the sound setting persists', async ({ page }) => {
  await page.goto(`${appUrl({ overrides: NO_ENEMIES })}&sound`)
  await page.getByRole('button', { name: 'Play' }).click()
  await waitForBattle(page)
  await page.evaluate(() => window.__PIRATE_AUDIO__!.ready())

  await page.keyboard.down('Space')
  await advance(page, 1 / 60)
  await page.keyboard.up('Space')
  await page.keyboard.down('KeyE')
  await advance(page, 1 / 60)
  await page.keyboard.up('KeyE')
  let sounds = await played(page)
  expect(sounds.cannonFire).toBe(1)
  expect(sounds.broadside).toBe(1) // three side shots, one broadside sound

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Resume' }).click()
  sounds = await played(page)
  expect(sounds.gamePause).toBe(1)
  expect(sounds.gameResume).toBe(1)

  // Mute from the pause dialog; the choice survives a reload.
  await page.keyboard.press('Escape')
  const toggle = page.getByRole('button', { name: 'Sound: on' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(page.getByRole('button', { name: 'Sound: off' })).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sound: off' })).toBeVisible({ timeout: 20_000 })
})
