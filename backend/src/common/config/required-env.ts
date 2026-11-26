/**
 * Reads a variable the app can't run safely without. The JWT secrets used to fall back
 * to hard-coded strings, which meant anyone reading the source could mint a valid
 * token for any user — failing at boot is the safer default.
 */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy backend/.env.example to .env and fill it in.`,
    );
  }
  return value;
}
