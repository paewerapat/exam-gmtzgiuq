import { BadRequestException, Injectable } from '@nestjs/common';
import { basename, extname, isAbsolute, join, relative, resolve } from 'path';
import { randomBytes } from 'crypto';
import { lstatSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';

export type ImageType = 'png' | 'jpg' | 'gif' | 'webp';

/** Extensions accepted from the client's original filename. */
export const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

export const INVALID_IMAGE_MESSAGE =
  'อนุญาตเฉพาะไฟล์รูปภาพ PNG, JPG, GIF หรือ WebP';

/**
 * Names the upload endpoint generates: `<Date.now()>-<16 hex>.<ext>`.
 * The extension part is loose so files uploaded before SEC-7 (which kept the
 * client's extension, e.g. `.PNG`, `.jpeg`, `.svg`) can still be cleaned up.
 * No slash, backslash, `%` or `..` can match, so a match is always a plain
 * file name directly inside the uploads directory.
 */
const UPLOAD_FILENAME_PATTERN = /^\d{1,16}-[0-9a-f]{16}(?:\.[a-z0-9]{1,10})?$/i;

@Injectable()
export class UploadService {
  private readonly uploadDir = join(process.cwd(), 'uploads');

  /** True if `filename` looks like a file this service created. */
  isUploadFilename(filename: unknown): filename is string {
    return (
      typeof filename === 'string' && UPLOAD_FILENAME_PATTERN.test(filename)
    );
  }

  /**
   * Detect the image type from the file's magic bytes (not from the client's
   * mimetype or filename). Returns null for anything else (HTML, SVG, ...).
   */
  detectImageType(buffer: Buffer | undefined): ImageType | null {
    if (!buffer || buffer.length < 12) return null;

    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((byte, i) => buffer[i] === byte)) return 'png';

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpg';
    }

    const head6 = buffer.toString('latin1', 0, 6);
    if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'gif';

    if (
      buffer.toString('latin1', 0, 4) === 'RIFF' &&
      buffer.toString('latin1', 8, 12) === 'WEBP'
    ) {
      return 'webp';
    }

    return null;
  }

  /** True if the client's filename ends with an allowed image extension. */
  hasAllowedExtension(originalname: string | undefined): boolean {
    if (!originalname) return false;
    const ext = extname(originalname).slice(1).toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.includes(ext);
  }

  /**
   * Validate an uploaded image held in memory and write it to the uploads
   * directory. The stored extension comes from the detected type, never from
   * the client. Nothing is written when validation fails.
   * Returns the generated filename.
   */
  saveImage(file: { originalname: string; buffer?: Buffer }): string {
    if (!this.hasAllowedExtension(file.originalname)) {
      throw new BadRequestException(INVALID_IMAGE_MESSAGE);
    }

    const type = this.detectImageType(file.buffer);
    if (!type || !file.buffer) {
      throw new BadRequestException(INVALID_IMAGE_MESSAGE);
    }

    mkdirSync(this.uploadDir, { recursive: true });
    const filename = `${Date.now()}-${randomBytes(8).toString('hex')}.${type}`;
    writeFileSync(join(this.uploadDir, filename), file.buffer, { flag: 'wx' });
    return filename;
  }

  /**
   * Extract the upload filename from a URL like
   * http://localhost:3001/uploads/1700000000000-0123456789abcdef.png
   * (or a relative /uploads/... path). Returns null if the URL is not a local
   * upload or the name is not one this service generates.
   */
  extractFilename(url: string): string | null {
    if (!url || typeof url !== 'string') return null;

    let pathname: string;
    try {
      // The base only makes relative paths parseable; URL also resolves
      // dot segments, so /uploads/../x becomes /x and is rejected below.
      pathname = new URL(url, 'http://localhost').pathname;
    } catch {
      return null;
    }

    const prefix = '/uploads/';
    if (!pathname.startsWith(prefix)) return null;

    const filename = pathname.slice(prefix.length);
    return this.isUploadFilename(filename) ? filename : null;
  }

  /**
   * Delete a file from the uploads directory by its full URL
   * Returns true if the file was deleted, false otherwise
   */
  deleteByUrl(url: string): boolean {
    const filename = this.extractFilename(url);
    if (!filename) return false;
    return this.deleteByFilename(filename);
  }

  /**
   * Delete a file from the uploads directory by filename.
   * Only names matching the generated pattern that resolve to a regular file
   * directly inside the uploads directory are deleted.
   */
  deleteByFilename(filename: string): boolean {
    if (!this.isUploadFilename(filename)) return false;

    const root = resolve(this.uploadDir);
    const filePath = resolve(root, basename(filename));
    const rel = relative(root, filePath);
    if (!rel || rel !== filename || rel.startsWith('..') || isAbsolute(rel)) {
      return false;
    }

    try {
      if (!lstatSync(filePath).isFile()) return false;
      unlinkSync(filePath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Failed to delete file: ${filePath}`, err);
      }
      return false;
    }
  }
}
