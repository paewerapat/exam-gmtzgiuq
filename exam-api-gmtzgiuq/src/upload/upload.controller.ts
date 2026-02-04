import {
  Controller,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
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
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const baseUrl =
      process.env.APP_URL ||
      `http://localhost:${process.env.APP_PORT || 3001}`;
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
