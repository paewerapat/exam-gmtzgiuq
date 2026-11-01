import {
  Controller,
  Post,
  Delete,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { INVALID_IMAGE_MESSAGE, UploadService } from './upload.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

// Ensure uploads directory exists (static serving at /uploads)
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp)$/i;

@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  // Admin only: the web uploads images from admin pages only (exams, blogs,
  // exam import). Files are kept in memory, checked by magic bytes and only
  // then written to disk by UploadService.saveImage.
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (_req, file, cb) => {
        if (
          !file.mimetype.startsWith('image/') ||
          !IMAGE_EXTENSION.test(file.originalname)
        ) {
          cb(new BadRequestException(INVALID_IMAGE_MESSAGE), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    }

    const filename = this.uploadService.saveImage(file);

    // Use APP_URL env var if set, otherwise derive from the incoming request
    // (handles reverse proxies / Plesk where the app runs on a non-standard port)
    const baseUrl =
      process.env.APP_URL ||
      (() => {
        const proto =
          (req.headers['x-forwarded-proto'] as string) || req.protocol;
        const host =
          (req.headers['x-forwarded-host'] as string) || req.headers.host;
        return `${proto}://${host}`;
      })();
    const url = `${baseUrl}/uploads/${filename}`;

    return { url, filename };
  }

  @Delete(':filename')
  @UseGuards(JwtAuthGuard, AdminGuard)
  deleteFile(@Param('filename') filename: string) {
    if (!this.uploadService.isUploadFilename(filename)) {
      throw new BadRequestException('ชื่อไฟล์ไม่ถูกต้อง');
    }

    const deleted = this.uploadService.deleteByFilename(filename);
    return { success: deleted };
  }
}
