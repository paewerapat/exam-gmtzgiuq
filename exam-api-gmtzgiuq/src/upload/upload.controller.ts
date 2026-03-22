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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UploadService } from './upload.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

// Ensure uploads directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const uniqueName = `${Date.now()}-${randomBytes(8).toString('hex')}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Only image files are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Use APP_URL env var if set, otherwise derive from the incoming request
    // (handles reverse proxies / Plesk where the app runs on a non-standard port)
    const baseUrl =
      process.env.APP_URL ||
      (() => {
        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
        const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
        return `${proto}://${host}`;
      })();
    const url = `${baseUrl}/uploads/${file.filename}`;

    return { url, filename: file.filename };
  }

  @Delete(':filename')
  @UseGuards(JwtAuthGuard)
  deleteFile(@Param('filename') filename: string) {
    if (!filename) {
      throw new BadRequestException('Filename is required');
    }

    const deleted = this.uploadService.deleteByFilename(filename);
    return { success: deleted };
  }
}
