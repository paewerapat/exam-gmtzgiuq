import { isIP } from 'net';

/**
 * Express `trust proxy`: on Plesk the API sits behind nginx / Passenger on
 * the same host, so the peer of every request is a local proxy. Trusting
 * only loopback (127.0.0.0/8, ::1), link-local (169.254.0.0/16, fe80::/10)
 * and unique-local (10/8, 172.16/12, 192.168/16, fc00::/7) peers makes
 * `req.ip` the client address from X-Forwarded-For (the right-most address
 * that is not such a proxy), while a request coming straight from a public
 * address cannot fake its IP with that header.
 *
 * Also makes `req.protocol` follow X-Forwarded-Proto from those proxies
 * (upload.controller.ts reads that header itself first, so it is unchanged).
 */
export const TRUST_PROXY = ['loopback', 'linklocal', 'uniquelocal'];

/**
 * The address cannot tell internet clients apart: missing / not an IP, or
 * a loopback, link-local or private address (a proxy hop seen because no
 * X-Forwarded-For came with the request — never a real client on the
 * internet). Limits keyed by client IP must not apply to these, or every
 * request would share one bucket.
 */
export function isUnresolvedClientIp(ip: unknown): boolean {
  if (typeof ip !== 'string') return true;
  let value = ip.trim().toLowerCase();
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) {
    value = value.slice(7);
  }
  const version = isIP(value);
  if (version === 4) {
    const [a, b] = value.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  if (version === 6) {
    return (
      value === '::1' ||
      value === '::' ||
      /^f[cd][0-9a-f]{2}:/.test(value) ||
      /^fe[89ab][0-9a-f]:/.test(value)
    );
  }
  return true;
}
