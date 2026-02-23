import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('curriculum')
export class CurriculumController {
  constructor(private curriculumService: CurriculumService) {}

  // ── PUBLIC ────────────────────────────────────────────────

  @Get('subjects')
  async getSubjects() {
    return this.curriculumService.findAllSubjects(true);
  }

  @Get('subjects/:id/chapters')
  async getChaptersBySubject(@Param('id') id: string) {
    return this.curriculumService.findChaptersBySubject(id);
  }

  @Get('chapters/:id/topics')
  async getTopicsByChapter(@Param('id') id: string) {
    return this.curriculumService.findTopicsByChapter(id);
  }

  @Get('topics/:id')
  async getTopic(@Param('id') id: string) {
    return this.curriculumService.findTopic(id);
  }

  // ── ADMIN — SUBJECTS ──────────────────────────────────────

  @Get('admin/tree')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getFullTree() {
    return this.curriculumService.getFullTree();
  }

  @Get('admin/subjects')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminGetSubjects() {
    return this.curriculumService.findAllSubjects(false);
  }

  @Post('admin/subjects')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createSubject(
    @Body()
    body: {
      name: string;
      description?: string;
      color?: string;
      iconEmoji?: string;
      orderIndex?: number;
    },
  ) {
    return this.curriculumService.createSubject(body);
  }

  @Put('admin/subjects/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateSubject(@Param('id') id: string, @Body() body: any) {
    return this.curriculumService.updateSubject(id, body);
  }

  @Delete('admin/subjects/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteSubject(@Param('id') id: string) {
    await this.curriculumService.removeSubject(id);
    return { success: true };
  }

  // ── ADMIN — CHAPTERS ──────────────────────────────────────

  @Post('admin/chapters')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createChapter(
    @Body()
    body: {
      subjectId: string;
      name: string;
      description?: string;
      orderIndex?: number;
    },
  ) {
    return this.curriculumService.createChapter(body);
  }

  @Put('admin/chapters/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateChapter(@Param('id') id: string, @Body() body: any) {
    return this.curriculumService.updateChapter(id, body);
  }

  @Delete('admin/chapters/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteChapter(@Param('id') id: string) {
    await this.curriculumService.removeChapter(id);
    return { success: true };
  }

  // ── ADMIN — TOPICS ────────────────────────────────────────

  @Post('admin/topics')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createTopic(
    @Body()
    body: {
      chapterId: string;
      name: string;
      description?: string;
      orderIndex?: number;
    },
  ) {
    return this.curriculumService.createTopic(body);
  }

  @Put('admin/topics/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateTopic(@Param('id') id: string, @Body() body: any) {
    return this.curriculumService.updateTopic(id, body);
  }

  @Delete('admin/topics/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteTopic(@Param('id') id: string) {
    await this.curriculumService.removeTopic(id);
    return { success: true };
  }
}
