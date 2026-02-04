import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

@Injectable()
export class UploadService {
  private readonly uploadDir = join(process.cwd(), 'uploads');

  /**
   * Extract filename from a full URL like http://localhost:3001/uploads/abc.jpg
   * Returns null if the URL is not a local upload
   */
  extractFilename(url: string): string | null {
    if (!url) return null;

    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/uploads/')) {
        return parsed.pathname.replace('/uploads/', '');
      }
    } catch {
      // Not a valid URL, check if it's a relative path
      if (url.startsWith('/uploads/')) {
        return url.replace('/uploads/', '');
      }
    }

    return null;
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
   * Delete a file from the uploads directory by filename
   */
  deleteByFilename(filename: string): boolean {
    const filePath = join(this.uploadDir, filename);

    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
        return true;
      } catch (err) {
        console.error(`Failed to delete file: ${filePath}`, err);
        return false;
      }
    }

    return false;
  }
}
