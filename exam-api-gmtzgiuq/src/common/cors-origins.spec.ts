import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { allowedOrigins, corsOptions } from './cors-origins';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('allowedOrigins (task 23)', () => {
  it('unset → exactly the old list', () => {
    expect(allowedOrigins({})).toEqual([
      'http://localhost:3000',
      'http://localhost:3000',
    ]);
    expect(allowedOrigins({ FRONTEND_URL: 'https://lumo-test.com' })).toEqual([
      'https://lumo-test.com',
      'http://localhost:3000',
    ]);
    expect(
      allowedOrigins({
        FRONTEND_URL: 'https://lumo-test.com',
        CORS_ORIGINS: '',
      }),
    ).toEqual(['https://lumo-test.com', 'http://localhost:3000']);
  });

  it('CORS_ORIGINS: trimmed, trailing / removed, blanks / duplicates dropped', () => {
    expect(
      allowedOrigins({
        FRONTEND_URL: 'https://a.test',
        CORS_ORIGINS: ' https://b.test, https://c.test/ ,, https://a.test,',
      }),
    ).toEqual([
      'https://a.test',
      'http://localhost:3000',
      'https://b.test',
      'https://c.test',
    ]);
  });

  it("never '*', 'null', paths or other schemes", () => {
    expect(
      allowedOrigins({
        FRONTEND_URL: 'https://a.test',
        CORS_ORIGINS:
          '*, null, https://*.evil.test, https://b.test/path, ftp://x.test, https://ok.test:8443',
      }),
    ).toEqual([
      'https://a.test',
      'http://localhost:3000',
      'https://ok.test:8443',
    ]);
  });
});

describe('corsOptions preflight (task 23 AC10)', () => {
  let app: INestApplication<App>;

  const start = async (env: Record<string, string>) => {
    const module = await Test.createTestingModule({
      controllers: [PingController],
    }).compile();
    app = module.createNestApplication();
    app.enableCors(corsOptions(env));
    await app.init();
  };

  const preflight = (origin: string) =>
    request(app.getHttpServer())
      .options('/ping')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

  afterEach(async () => {
    await app.close();
  });

  it('FRONTEND_URL a + CORS_ORIGINS b, c/ → a, b, c allowed; evil not', async () => {
    await start({
      FRONTEND_URL: 'https://a.test',
      CORS_ORIGINS: 'https://b.test, https://c.test/',
    });
    for (const origin of [
      'https://a.test',
      'https://b.test',
      'https://c.test',
      'http://localhost:3000',
    ]) {
      const res = await preflight(origin);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    }
    const evil = await preflight('https://evil.test');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const get = await request(app.getHttpServer())
      .get('/ping')
      .set('Origin', 'https://b.test')
      .expect(200);
    expect(get.headers['access-control-allow-origin']).toBe('https://b.test');
    expect(get.headers['access-control-expose-headers']).toBe(
      'Content-Disposition',
    );
  });

  it('CORS_ORIGINS unset → only FRONTEND_URL + localhost:3000 as before', async () => {
    await start({ FRONTEND_URL: 'https://a.test' });
    expect(
      (await preflight('https://a.test')).headers[
        'access-control-allow-origin'
      ],
    ).toBe('https://a.test');
    expect(
      (await preflight('https://b.test')).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
  });
});
