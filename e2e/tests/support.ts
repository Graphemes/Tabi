import { createHmac } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const API_PORT = 3101;
export const APP_PORT = 3100;
export const API = `http://localhost:${API_PORT}`;
export const OUTPUT_DIR = join(__dirname, "..", ".output");
export const BACKEND_LOG = join(OUTPUT_DIR, "backend.log");

export type Coords = { latitude: number; longitude: number };

/** A value from the real environment, else from backend/.env — the same order the backend uses. */
export function readBackendEnv(name: string): string {
  if (process.env[name]) return process.env[name]!;

  const file = readFileSync(join(__dirname, "..", "..", "backend", ".env"), "utf8");
  const match = new RegExp(`^${name}=(.*)$`, "m").exec(file);
  if (!match) throw new Error(`${name} is not set in backend/.env`);
  return match[1].trim().replace(/^"(.*)"$/, "$1");
}

const backendLog = () => readFileSync(BACKEND_LOG, "utf8").replace(/\x1b\[[0-9;]*m/g, "");

/** OTPs are logged instead of sent (no SMS in dev), so read the newest one for this phone. */
async function otpFor(phone: string, logOffset: number): Promise<string> {
  const pattern = new RegExp(`OTP\\] For \\+?\\d*${phone}: (\\d+)`, "g");
  let otp: string | undefined;
  await expect
    .poll(() => {
      otp = [...backendLog().slice(logOffset).matchAll(pattern)].pop()?.[1];
      return otp;
    }, { message: `OTP for ${phone} never appeared in the backend log` })
    .toBeTruthy();
  return otp!;
}

export async function api<T = unknown>(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

export type SocketEvent = { name: string; body: any; at: number };

/**
 * Records socket.io events the page receives, so realtime delivery is asserted directly —
 * the 30s live-location poll would otherwise hide a dead socket in DOM-based checks.
 * Must be attached before the page opens its socket.
 */
function recordSocket(page: Page): SocketEvent[] {
  const events: SocketEvent[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      const match = /^42\/realtime,(\[.*)$/s.exec(String(payload));
      if (!match) return;
      try {
        const [name, body] = JSON.parse(match[1]);
        events.push({ name, body, at: Date.now() });
      } catch {
        // Not an event frame.
      }
    });
  });
  return events;
}

export type TestUser = {
  ctx: BrowserContext;
  page: Page;
  phone: string;
  token: string;
  profile: { id: number; name: string | null; username: string | null; phone: string };
  /** What the app shows for this person: name, else username, else phone. */
  displayName: string;
  events: SocketEvent[];
  errors: string[];
};

/** A brand-new user, signed in through the real OTP screens, with a simulated GPS fix. */
export async function signUp(browser: Browser, coords: Coords): Promise<TestUser> {
  const ctx = await browser.newContext({ geolocation: coords, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // 401s are expected: the app refreshes its token on them.
    if (m.type() === "error" && !/401|Unauthorized|Failed to load resource/i.test(m.text())) {
      errors.push(m.text());
    }
  });
  const events = recordSocket(page);

  const phone = "9" + String(Date.now()).slice(-9);
  await page.goto("/");
  await page.locator("#mobile").fill(phone);
  const logOffset = backendLog().length;
  await page.locator('button[type="submit"]').click();
  await page.getByPlaceholder("000000").fill(await otpFor(phone, logOffset));
  const verify = page.getByRole("button", { name: "Verify and continue" });
  await verify.click();
  await expect(verify).toBeHidden();

  const token = (await page.evaluate(() => localStorage.getItem("tabi.accessToken")))!;
  const { data: profile } = await api<TestUser["profile"]>(token, "GET", "/users/profile");
  const displayName = profile.name || profile.username || profile.phone;
  return { ctx, page, phone, token, profile, displayName, events, errors };
}

/** HS256 JWT, so the suite can hand the app an already-expired access token. */
export function expiredAccessToken(userId: number): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, email: "", iat: now - 120, exp: now - 60 })}`;
  const signature = createHmac("sha256", readBackendEnv("JWT_SECRET")).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

/** Waits for a socket event matching `match` that arrived after `since`. */
export async function socketEvent(
  user: TestUser,
  since: number,
  match: (event: SocketEvent) => boolean,
  timeout = 25_000,
): Promise<SocketEvent> {
  let found: SocketEvent | undefined;
  await expect
    .poll(() => (found = user.events.find((e) => e.at >= since && match(e))), { timeout })
    .toBeTruthy();
  return found!;
}
