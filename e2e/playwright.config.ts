import { defineConfig } from "@playwright/test";
import { mkdirSync } from "fs";
import { API_PORT, APP_PORT, BACKEND_LOG, OUTPUT_DIR, readBackendEnv } from "./tests/support";

/**
 * Runs the real backend and a production build of the frontend on spare ports (so a dev
 * stack on 3000/3001 can keep running), against a dedicated `tabi_e2e` database that is
 * rebuilt from the migrations on every run.
 */
mkdirSync(OUTPUT_DIR, { recursive: true });

const devDatabaseUrl = readBackendEnv("DATABASE_URL");
const e2eDatabaseUrl = devDatabaseUrl.replace(/\/[^/?]+(\?|$)/, "/tabi_e2e$1");

// `migrate reset` drops everything in the target database. Refuse to run unless the
// target really is the throwaway one, whatever the dev URL looks like.
if (!/\/tabi_e2e(\?|$)/.test(e2eDatabaseUrl)) {
  throw new Error(`Refusing to reset a database not named tabi_e2e: ${e2eDatabaseUrl}`);
}

export default defineConfig({
  testDir: "./tests",
  // One long two-user scenario; parallel workers would race on the same backend log.
  workers: 1,
  timeout: 5 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // The OTP is logged rather than sent, so the tests read it from this log.
      command: `cd ../backend && npx prisma migrate reset --force --skip-generate --skip-seed && npx nest build && node dist/main.js > ${BACKEND_LOG} 2>&1`,
      url: `http://localhost:${API_PORT}/users/profile`,
      env: { PORT: String(API_PORT), DATABASE_URL: e2eDatabaseUrl },
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: `cd ../frontend && npx next build && npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      env: {
        NEXT_PUBLIC_API_BASE_URL: `http://localhost:${API_PORT}`,
        NEXT_PUBLIC_SOCKET_BASE_URL: `http://localhost:${API_PORT}`,
      },
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
