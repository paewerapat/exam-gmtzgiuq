import { BadRequestException } from '@nestjs/common';
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
import { UploadService } from './upload.service';

// Minimal valid headers for each accepted type (padded past 12 bytes).
const IMAGE_BYTES = {
  png: Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  ]),
  jpg: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1,
  ]),
  gif: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(8)]),
  webp: Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0, 0, 0]),
    Buffer.from('WEBPVP8 '),
  ]),
};
const HTML_BYTES = Buffer.from(
  '<!DOCTYPE html><html><script>alert(document.domain)</script></html>',
);
const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
);

const VALID = '1700000000000-0123456789abcdef.png';

describe('UploadService', () => {
  let root: string;
  let uploadDir: string;
  let service: UploadService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lumo-upload-'));
    uploadDir = join(root, 'uploads');
    mkdirSync(uploadDir);
    // uploadDir is derived from process.cwd() when the service is created
    jest.spyOn(process, 'cwd').mockReturnValue(root);
    service = new UploadService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  /** Files outside uploads/ that an attacker would like to delete. */
  function plantOutsideFiles(): string[] {
    mkdirSync(join(root, 'dist'));
    const files = [
      join(root, 'main.js'),
      join(root, 'dist', 'main.js'),
      join(root, VALID), // same valid name, but one level above uploads
    ];
    for (const f of files) writeFileSync(f, 'keep');
    return files;
  }

  describe('isUploadFilename', () => {
    it.each([
      VALID,
      '1700000000000-0123456789abcdef.jpg',
      '1700000000000-0123456789abcdef.webp',
      '1700000000000-0123456789abcdef.PNG', // legacy upload kept client ext
      '1700000000000-0123456789abcdef.svg', // legacy, must stay deletable
    ])('accepts generated name %s', (name) => {
      expect(service.isUploadFilename(name)).toBe(true);
    });

    it.each([
      '',
      '../x',
      '../../dist/main.js',
      '..%2F..%2Fx',
      '%2e%2e%2fx',
      '..\\..\\x',
      `../${VALID}`,
      `sub/${VALID}`,
      '.htaccess',
      'main.js',
      'a.png',
      '1700000000000-0123456789abcdeg.png', // not hex
      '1700000000000-0123456789abcdef.png/..',
      '1700000000000-0123456789abcdef..png',
    ])('rejects %p', (name) => {
      expect(service.isUploadFilename(name)).toBe(false);
    });

    it('rejects non-strings', () => {
      expect(service.isUploadFilename(undefined)).toBe(false);
      expect(service.isUploadFilename(['a'])).toBe(false);
    });
  });

  describe('detectImageType', () => {
    it.each(Object.entries(IMAGE_BYTES))('detects %s', (type, bytes) => {
      expect(service.detectImageType(bytes)).toBe(type);
    });

    it.each([
      ['html', HTML_BYTES],
      ['svg', SVG_BYTES],
      ['empty', Buffer.alloc(0)],
      ['short png prefix', IMAGE_BYTES.png.subarray(0, 4)],
    ])('rejects %s', (_label, bytes) => {
      expect(service.detectImageType(bytes)).toBeNull();
    });
  });

  describe('saveImage (SEC-7)', () => {
    it.each(Object.entries(IMAGE_BYTES))(
      'stores a real %s with the detected extension',
      (type, bytes) => {
        const filename = service.saveImage({
          originalname: 'photo.png',
          buffer: bytes,
        });

        expect(filename).toMatch(new RegExp(`^\\d+-[0-9a-f]{16}\\.${type}$`));
        expect(service.isUploadFilename(filename)).toBe(true);
        expect(readdirSync(uploadDir)).toEqual([filename]);
      },
    );

    it('uses the detected type, not the client extension', () => {
      const filename = service.saveImage({
        originalname: 'photo.JPEG',
        buffer: IMAGE_BYTES.png,
      });
      expect(filename.endsWith('.png')).toBe(true);
    });

    it.each([
      ['HTML named .png', 'x.png', HTML_BYTES],
      ['SVG named .png', 'x.png', SVG_BYTES],
      ['.html file', 'x.html', HTML_BYTES],
      ['.svg file', 'x.svg', SVG_BYTES],
      ['.html file with PNG bytes', 'x.html', IMAGE_BYTES.png],
      ['.svg file with PNG bytes', 'x.svg', IMAGE_BYTES.png],
      ['no extension', 'x', IMAGE_BYTES.png],
      ['no buffer', 'x.png', undefined],
    ])('rejects %s with 400 and writes nothing', (_label, name, bytes) => {
      expect(() =>
        service.saveImage({ originalname: name, buffer: bytes }),
      ).toThrow(BadRequestException);
      expect(readdirSync(uploadDir)).toEqual([]);
    });
  });

  describe('deleteByFilename (SEC-4)', () => {
    it('deletes a generated file inside uploads', () => {
      writeFileSync(join(uploadDir, VALID), 'img');

      expect(service.deleteByFilename(VALID)).toBe(true);
      expect(existsSync(join(uploadDir, VALID))).toBe(false);
    });

    it('returns false when the file does not exist', () => {
      expect(service.deleteByFilename(VALID)).toBe(false);
    });

    it.each([
      '../main.js',
      '../dist/main.js',
      '../../dist/main.js',
      `../${VALID}`,
      '..%2Fmain.js',
      '%2e%2e%2fmain.js',
      '<ROOT>/main.js', // absolute path into the planted root
      '<ROOT>/' + VALID,
      'main.js',
    ])('does not delete anything for %p', (name) => {
      const outside = plantOutsideFiles();
      writeFileSync(join(uploadDir, 'main.js'), 'keep');

      expect(service.deleteByFilename(name.replace('<ROOT>', root))).toBe(
        false,
      );

      for (const f of outside) expect(existsSync(f)).toBe(true);
      expect(existsSync(join(uploadDir, 'main.js'))).toBe(true);
    });

    it('does not remove a directory with a valid-looking name', () => {
      mkdirSync(join(uploadDir, VALID));
      expect(service.deleteByFilename(VALID)).toBe(false);
      expect(existsSync(join(uploadDir, VALID))).toBe(true);
    });
  });

  describe('extractFilename / deleteByUrl (SEC-4)', () => {
    it.each([
      [`http://localhost:3001/uploads/${VALID}`, VALID],
      [`https://api.lumo-test.com/uploads/${VALID}`, VALID],
      [`/uploads/${VALID}`, VALID],
      [`/uploads/${VALID}?v=1`, VALID],
    ])('extracts %s', (url, expected) => {
      expect(service.extractFilename(url)).toBe(expected);
    });

    it.each([
      '',
      'https://example.com/image.png',
      '/uploads/../../dist/main.js',
      '/uploads/../main.js',
      `/uploads/../${VALID}`,
      'http://x/uploads/..%2f..%2fmain.js',
      'http://x/uploads/..%2F..%2Fdist%2Fmain.js',
      'http://x/uploads/%2e%2e%2fmain.js',
      'http://x/uploads/%2e%2e/main.js',
      `http://x/uploads/sub/${VALID}`,
      'http://x/uploads/main.js',
      `http://x/other/${VALID}`,
    ])('returns null for %p', (url) => {
      expect(service.extractFilename(url)).toBeNull();
    });

    it.each([
      '/uploads/../../dist/main.js',
      '/uploads/../main.js',
      `/uploads/../${VALID}`,
      'http://x/uploads/..%2f..%2fmain.js',
      'http://x/uploads/..%2F..%2Fdist%2Fmain.js',
      'http://x/uploads/%2e%2e%2fmain.js',
    ])('deleteByUrl(%p) deletes nothing', (url) => {
      const outside = plantOutsideFiles();

      expect(service.deleteByUrl(url)).toBe(false);

      for (const f of outside) expect(existsSync(f)).toBe(true);
    });

    it('deleteByUrl deletes a real upload by URL', () => {
      writeFileSync(join(uploadDir, VALID), 'img');

      expect(
        service.deleteByUrl(`http://localhost:3001/uploads/${VALID}`),
      ).toBe(true);
      expect(existsSync(join(uploadDir, VALID))).toBe(false);
    });
  });
});
