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
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('categories')
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() body: { name: string; slug: string; orderIndex?: number }) {
    return this.service.create(body);
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body() body: { name?: string; slug?: string; orderIndex?: number }) {
    return this.service.update(id, body);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}
