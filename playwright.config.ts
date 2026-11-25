import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry everywhere: WebGL-heavy tests can stall under parallel load; retried tests are reported as flaky.
  retries: 1,
  timeout: 60_000,
  // The HTML report is a deliverable: it lives in docs/ and is versioned.
  reporter: [['html', { outputFolder: 'docs/test-report', open: 'never' }], ['list']],
  // One baseline per project, shared across operating systems (no platform suffix).
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: {
    // Baselines are generated on Linux (npm run test:e2e:docker). threshold 0.3 absorbs per-pixel anti-aliasing,
    // the 3 % budget covers the rest: measured worst case Windows vs Linux = 1.79 %.
    // PW_MAX_DIFF_RATIO=0 prints the real difference of every capture.
    toHaveScreenshot: { maxDiffPixelRatio: Number(process.env.PW_MAX_DIFF_RATIO ?? 0.03), animations: 'disabled', caret: 'hide', threshold: 0.3 },
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7 landscape'] } },
  ],
  // Tests run against the optimized build, same as the deployed version.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
