import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PredictedService } from './predicted.service';
import {
  CreatePredictedSeriesDto,
  UpdatePredictedSeriesDto,
} from './dto/predicted.dto';

/** Admin of Predicted Exam series and their sets (task 22). */
@Controller('admin/predicted')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PredictedAdminController {
  constructor(private predictedService: PredictedService) {}

  // Exams that can be added to a series (not in a series, not Mock /
  // bankOnly) for the form's search box
  @Get('exams')
  async examOptions(@Query('search') search?: string) {
    return this.predictedService.adminExamOptions(
      typeof search === 'string' ? search : undefined,
    );
  }

  // ?venue=<venue key or id>
  @Get('series')
  async list(@Query('venue') venue?: string) {
    return this.predictedService.adminList(
      typeof venue === 'string' ? venue : undefined,
    );
  }

  @Post('series')
  async create(@Body() input: CreatePredictedSeriesDto) {
    return this.predictedService.adminCreate(input);
  }

  @Get('series/:id')
  async get(@Param('id') id: string) {
    return this.predictedService.adminGet(id);
  }

  // `sets` sent = replaces every set of the series
  @Put('series/:id')
  async update(
    @Param('id') id: string,
    @Body() input: UpdatePredictedSeriesDto,
  ) {
    return this.predictedService.adminUpdate(id, input);
  }

  // The exams of its sets become ordinary exam sets again
  @Delete('series/:id')
  async remove(@Param('id') id: string) {
    return this.predictedService.adminDelete(id);
  }
}
