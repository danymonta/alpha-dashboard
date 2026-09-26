import { defineConfig } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/** Screenshots for ui-critic: every page of every role, at 390px and 1440px. */
export default defineConfig({
  testDir: './e2e',
  testMatch: /shots\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    colorScheme: 'dark',
    // native date/time inputs follow the browser UI language, not the page's
    launchOptions: { args: ['--lang=it-IT'] },
  },
  projects: [
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
