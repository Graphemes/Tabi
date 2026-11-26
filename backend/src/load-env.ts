/**
 * Loads backend/.env before any other module is evaluated. Several modules read secrets
 * at import time (e.g. `JwtModule.register`), so this must be the first import in
 * main.ts. Previously .env reached `process.env` only as a side effect of Prisma's
 * client loading first — an import-order accident, not a guarantee.
 *
 * Real environment variables win over the file, and a missing file is fine: deployed
 * environments set variables directly. The path is resolved from this file (src/ or
 * dist/, both one level below backend/), not the working directory, so starting the
 * server from elsewhere still finds backend/.env.
 */
import { join } from 'path';

// Node 20.12+ API; the installed @types/node predates it.
const { loadEnvFile } = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};

if (!loadEnvFile) {
  throw new Error(`Node 20.12+ is required (running ${process.version}).`);
}

try {
  loadEnvFile(join(__dirname, '..', '.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
