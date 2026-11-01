import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import express from 'express';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { uploadSecurityHeaders } from './upload-headers';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
]);
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1,
]);
const HTML = Buffer.from(
  '<html><script>alert(document.domain)</script></html>',
);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
);
const VALID = '1700000000000-0123456789abcdef.png';
const GENERATED = /^\d+-[0-9a-f]{16}\.(png|jpg|gif|webp)$/;

/**
 * Stand-in for the passport JWT guard: the `x-test-role` header becomes
 * req.user.role. The real AdminGuard still runs.
 */
const fakeJwtGuard = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const role = req.headers['x-test-role'];
    if (!role) throw new UnauthorizedException();
    req.user = { id: `${role}-1`, role };
    return true;
  },
};

describe('UploadController (HTTP)', () => {
  let root: string;
  let uploadDir: string;
  let app: INestApplication<App>;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'lumo-upload-http-'));
    uploadDir = join(root, 'uploads');
    mkdirSync(uploadDir);
    jest.spyOn(process, 'cwd').mockReturnValue(root);

    const moduleRef = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [UploadService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    // Same order as main.ts
    app.use('/uploads', uploadSecurityHeaders);
    app.use('/uploads', express.static(uploadDir));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function plantOutsideFiles(): string[] {
    mkdirSync(join(root, 'dist'));
    const files = [
      join(root, 'main.js'),
      join(root, 'dist', 'main.js'),
      join(root, VALID),
    ];
    for (const f of files) writeFileSync(f, 'keep');
    return files;
  }

  describe('DELETE /upload/:filename (SEC-4)', () => {
    it('401 without a token', async () => {
      await request(app.getHttpServer()).delete(`/upload/${VALID}`).expect(401);
    });

    it.each([VALID, '..%2F..%2Fmain.js', 'anything'])(
      '403 for a normal user (%s) and nothing is deleted',
      async (name) => {
        writeFileSync(join(uploadDir, VALID), 'img');
        const outside = plantOutsideFiles();

        await request(app.getHttpServer())
          .delete(`/upload/${name}`)
          .set('x-test-role', 'user')
          .expect(403);

        expect(existsSync(join(uploadDir, VALID))).toBe(true);
        for (const f of outside) expect(existsSync(f)).toBe(true);
      },
    );

    it.each([
      '..%2F..%2Fmain.js',
      '..%2Fmain.js',
      '..%2F..%2Fdist%2Fmain.js',
      `..%2F${VALID}`,
      '%2e%2e%2fmain.js',
      '%2E%2E%2F%2E%2E%2Fdist%2Fmain.js',
      '..%5Cmain.js',
      'main.js',
      'not-a-generated-name.png',
    ])(
      'admin gets 400 for %s and no file outside uploads is deleted',
      async (name) => {
        const outside = plantOutsideFiles();

        await request(app.getHttpServer())
          .delete(`/upload/${name}`)
          .set('x-test-role', 'admin')
          .expect(400);

        for (const f of outside) expect(existsSync(f)).toBe(true);
      },
    );

    it('admin deletes an uploaded file (200)', async () => {
      const up = await request(app.getHttpServer())
        .post('/upload')
        .set('x-test-role', 'admin')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
      const { filename } = up.body as { filename: string };

      const res = await request(app.getHttpServer())
        .delete(`/upload/${encodeURIComponent(filename)}`)
        .set('x-test-role', 'admin')
        .expect(200);

      expect(res.body).toEqual({ success: true });
      expect(readdirSync(uploadDir)).toEqual([]);
    });
  });

  describe('POST /upload (SEC-7)', () => {
    it('403 for a normal user and nothing is written', async () => {
      await request(app.getHttpServer())
        .post('/upload')
        .set('x-test-role', 'user')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(403);

      expect(readdirSync(uploadDir)).toEqual([]);
    });

    it.each([
      ['PNG', PNG, 'a.png', 'image/png', 'png'],
      ['JPEG named .jpeg', JPEG, 'a.jpeg', 'image/jpeg', 'jpg'],
      ['PNG named .jpg', PNG, 'a.jpg', 'image/jpeg', 'png'],
    ])(
      'admin uploads a real %s and gets a URL with the detected extension',
      async (_label, bytes, name, type, ext) => {
        const res = await request(app.getHttpServer())
          .post('/upload')
          .set('x-test-role', 'admin')
          .attach('file', bytes, { filename: name, contentType: type })
          .expect(201);

        const body = res.body as { url: string; filename: string };
        expect(body.filename).toMatch(GENERATED);
        expect(body.filename.endsWith(`.${ext}`)).toBe(true);
        expect(body.url.endsWith(`/uploads/${body.filename}`)).toBe(true);
        expect(readdirSync(uploadDir)).toEqual([body.filename]);
      },
    );

    it.each([
      ['HTML sent as image/png', HTML, 'x.png', 'image/png'],
      ['SVG sent as image/png', SVG, 'x.png', 'image/png'],
      ['.svg named file sent as image/png', SVG, 'x.svg', 'image/png'],
      ['.html file sent as image/png', HTML, 'x.html', 'image/png'],
      ['.html file sent as text/html', HTML, 'x.html', 'text/html'],
      ['.svg file as image/svg+xml', SVG, 'x.svg', 'image/svg+xml'],
      ['PNG bytes named .html', PNG, 'x.html', 'image/png'],
    ])(
      'admin gets 400 for %s and no file is left behind',
      async (_label, bytes, name, type) => {
        await request(app.getHttpServer())
          .post('/upload')
          .set('x-test-role', 'admin')
          .attach('file', bytes, { filename: name, contentType: type })
          .expect(400);

        expect(readdirSync(uploadDir)).toEqual([]);
      },
    );

    it('400 when no file is sent', async () => {
      await request(app.getHttpServer())
        .post('/upload')
        .set('x-test-role', 'admin')
        .expect(400);
    });
  });

  describe('GET /uploads/* headers (AC4)', () => {
    it('serves uploads with nosniff and a sandbox CSP', async () => {
      writeFileSync(join(uploadDir, VALID), PNG);

      const res = await request(app.getHttpServer())
        .get(`/uploads/${VALID}`)
        .expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain('sandbox');
      expect(res.headers['content-type']).toBe('image/png');
    });

    it('sets nosniff on a legacy non-image file too', async () => {
      writeFileSync(join(uploadDir, 'legacy.html'), HTML);

      const res = await request(app.getHttpServer())
        .get('/uploads/legacy.html')
        .expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
    });
  });
});
