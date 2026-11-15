import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

// process.env or a test object (reads FRONTEND_URL and CORS_ORIGINS)
type CorsEnv = Record<string, string | undefined>;

// scheme://host[:port] only: no path, no wildcard, no spaces
const ORIGIN_PATTERN = /^https?:\/\/[^\s/*]+$/i;

/**
 * Web origins that may call the API: FRONTEND_URL (as before, default
 * http://localhost:3000), http://localhost:3000, and CORS_ORIGINS (task 23,
 * comma-separated, e.g. both domains while moving lumo-test.com →
 * lumoexam.com). CORS_ORIGINS entries are trimmed and lose a trailing '/';
 * blanks and anything that is not a plain http(s) origin ('*', 'null',
 * paths) are dropped. Unset → exactly the old list.
 */
export function allowedOrigins(env: CorsEnv): string[] {
  const list = [env.FRONTEND_URL || 'http://localhost:3000'];
  list.push('http://localhost:3000');
  for (const raw of (env.CORS_ORIGINS ?? '').split(',')) {
    const origin = raw.trim().replace(/\/+$/, '');
    if (ORIGIN_PATTERN.test(origin) && !list.includes(origin)) {
      list.push(origin);
    }
  }
  return list;
}

/** Options of app.enableCors: only the listed origins (or no Origin). */
export function corsOptions(env: CorsEnv): CorsOptions {
  const origins = allowedOrigins(env);
  return {
    origin: (origin, callback) => {
      callback(null, !origin || origins.includes(origin));
    },
    credentials: true,
    // Lets the web read the file name of downloads
    // (GET /unlock-codes/admin/batches/:id/codes.csv, task 15)
    exposedHeaders: ['Content-Disposition'],
  };
}
