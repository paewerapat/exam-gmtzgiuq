import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('feedback')
export class FeedbackController {
  constructor(private feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  async create(@Body() dto: CreateFeedbackDto, @Request() req) {
    return this.feedbackService.create(dto, req.user?.id ?? null);
  }

  // Admin - list feedback submissions
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.feedbackService.findAll(+page, +limit);
  }
}
