import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BlogsService } from './blogs.service';
import {
  CreateBlogInput,
  UpdateBlogInput,
  PaginatedBlogs,
} from './dto/blog.dto';
import { Blog, BlogStatus } from './blog.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('blogs')
export class BlogsController {
  constructor(private blogsService: BlogsService) {}

  // Public - Get published blogs
  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<PaginatedBlogs> {
    return this.blogsService.findPublished(+page, +limit);
  }

  // Public - Get single blog by slug
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<Blog> {
    return this.blogsService.findBySlug(slug);
  }

  // Admin - Get all blogs
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: BlogStatus,
  ): Promise<PaginatedBlogs> {
    return this.blogsService.findAll(+page, +limit, status);
  }

  // Admin - Get blog stats
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getStats(): Promise<{
    total: number;
    published: number;
    draft: number;
  }> {
    return this.blogsService.getStats();
  }

  // Admin - Get single blog by ID
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindOne(@Param('id') id: string): Promise<Blog> {
    return this.blogsService.findOne(id);
  }

  // Admin - Create blog
  @Post('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(
    @Body() createBlogInput: CreateBlogInput,
    @Request() req,
  ): Promise<Blog> {
    return this.blogsService.create(createBlogInput, req.user);
  }

  // Admin - Update blog
  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body() updateBlogInput: UpdateBlogInput,
  ): Promise<Blog> {
    return this.blogsService.update(id, updateBlogInput);
  }

  // Admin - Delete blog
  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.blogsService.remove(id);
    return { success: true };
  }
}
