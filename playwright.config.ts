import { defineConfig } from '@playwright/test';
import os from 'os';
import path from 'path';

// The npm package wants chromium-1208 but this machine has chromium-1248
// cached (same major line, used by the environment's own tooling) — point at
// it directly instead of downloading another browser.
const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');

export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: { executablePath: CHROME },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
