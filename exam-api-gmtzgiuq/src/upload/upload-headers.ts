import type { NextFunction, Request, Response } from 'express';

/**
 * Headers for every response under /uploads (SEC-7, second layer):
 * - nosniff: the browser must use the served Content-Type, never sniff HTML
 * - CSP sandbox: even if a script-capable file got in, it cannot run with the
 *   API origin's privileges (images still render)
 */
export const UPLOAD_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

/** Set the upload security headers on a response (static `setHeaders`). */
export function setUploadSecurityHeaders(
  res: Pick<Response, 'setHeader'>,
): void {
  for (const [name, value] of Object.entries(UPLOAD_SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

/** Express middleware; mount it on /uploads before the static handlers. */
export function uploadSecurityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  setUploadSecurityHeaders(res);
  next();
}
