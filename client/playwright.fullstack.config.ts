import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-fullstack',
  webServer: [
    {
      command: 'npm run build -w server && npm run start -w server',
      cwd: '..',
      url: 'http://127.0.0.1:3000/health/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -w client',
      cwd: '..',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
