import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command:
          "node node_modules/next/dist/bin/next dev --hostname 0.0.0.0 --port 3100",
        url: baseURL,
        env: {
          ...process.env,
          CLUTCH_NEXT_DIST_DIR: ".next-e2e",
        },
        reuseExistingServer: false,
        stderr: "ignore",
        stdout: "ignore",
        timeout: 120_000,
      },
  projects: [
    {
      name: "android-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 15"] },
    },
  ],
});
