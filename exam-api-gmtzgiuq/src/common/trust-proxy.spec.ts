import express from 'express';
import request from 'supertest';
import { TRUST_PROXY, isUnresolvedClientIp } from './trust-proxy';

/** req.ip as Express works it out for a peer address + X-Forwarded-For. */
function ipFor(
  app: express.Express,
  peer: string,
  forwardedFor?: string,
): string | undefined {
  const req = Object.create(express.request) as express.Request & {
    app: express.Express;
  };
  const socket = { remoteAddress: peer };
  Object.assign(req, {
    app,
    socket,
    connection: socket,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  });
  return req.ip;
}

describe('trust proxy (task 18 round 3)', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.set('trust proxy', TRUST_PROXY);
    app.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
  });

  it('a local proxy (loopback peer) passes the client from X-Forwarded-For', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);
    expect((res.body as { ip: string }).ip).toBe('203.0.113.7');
  });

  it('a value the client forged in front is ignored: the address the proxy saw wins', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '1.2.3.4, 198.51.100.4')
      .expect(200);
    expect((res.body as { ip: string }).ip).toBe('198.51.100.4');
  });

  it('without the header the peer itself (loopback → not limited)', async () => {
    const res = await request(app).get('/ip').expect(200);
    expect(isUnresolvedClientIp((res.body as { ip: string }).ip)).toBe(true);
  });

  it('a public peer cannot choose its IP with X-Forwarded-For', () => {
    expect(ipFor(app, '203.0.113.50', '10.9.9.9')).toBe('203.0.113.50');
    expect(ipFor(app, '203.0.113.50', '1.1.1.1')).toBe('203.0.113.50');
  });

  it('link-local / unique-local proxies are trusted too', () => {
    expect(ipFor(app, '10.0.0.2', '203.0.113.8')).toBe('203.0.113.8');
    expect(ipFor(app, '169.254.1.1', '203.0.113.8')).toBe('203.0.113.8');
    expect(ipFor(app, 'fd00::1', '203.0.113.8')).toBe('203.0.113.8');
  });

  it('isUnresolvedClientIp', () => {
    for (const ip of [
      undefined,
      '',
      'unknown',
      '127.0.0.1',
      '::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isUnresolvedClientIp(ip)).toBe(true);
    }
    // private / link-local: a proxy hop without X-Forwarded-For, not a client
    for (const ip of [
      '10.0.0.2',
      '172.20.1.1',
      '192.168.1.5',
      '169.254.1.1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.1.2.3',
      'garbage',
    ]) {
      expect(isUnresolvedClientIp(ip)).toBe(true);
    }
    for (const ip of [
      '203.0.113.7',
      '172.32.0.1',
      '::ffff:198.51.100.4',
      '2001:db8::1',
    ]) {
      expect(isUnresolvedClientIp(ip)).toBe(false);
    }
  });
});
