import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Blog, BlogStatus } from './blog.entity';
import { BlogsService } from './blogs.service';
import {
  CreateBlogInput,
  UpdateBlogInput,
  PaginatedBlogs,
} from './dto/blog.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { User } from '../users/user.entity';

@Resolver(() => Blog)
export class BlogsResolver {
  constructor(private blogsService: BlogsService) {}

  // Public - Get published blogs
  @Query(() => PaginatedBlogs)
  async blogs(
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 })
    page: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 10 })
    limit: number,
  ): Promise<PaginatedBlogs> {
    return this.blogsService.findPublished(page, limit);
  }

  // Public - Get single blog by slug
  @Query(() => Blog)
  async blogBySlug(@Args('slug') slug: string): Promise<Blog> {
    return this.blogsService.findBySlug(slug);
  }

  // Admin - Get all blogs (including drafts)
  @Query(() => PaginatedBlogs)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async adminBlogs(
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 })
    page: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 10 })
    limit: number,
    @Args('status', { type: () => BlogStatus, nullable: true })
    status?: BlogStatus,
  ): Promise<PaginatedBlogs> {
    return this.blogsService.findAll(page, limit, status);
  }

  // Admin - Get single blog by ID
  @Query(() => Blog)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async adminBlog(@Args('id') id: string): Promise<Blog> {
    return this.blogsService.findOne(id);
  }

  // Admin - Create blog
  @Mutation(() => Blog)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async createBlog(
    @Args('input') createBlogInput: CreateBlogInput,
    @CurrentUser() user: User,
  ): Promise<Blog> {
    return this.blogsService.create(createBlogInput, user);
  }

  // Admin - Update blog
  @Mutation(() => Blog)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async updateBlog(
    @Args('id') id: string,
    @Args('input') updateBlogInput: UpdateBlogInput,
  ): Promise<Blog> {
    return this.blogsService.update(id, updateBlogInput);
  }

  // Admin - Delete blog
  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, AdminGuard)
  async deleteBlog(@Args('id') id: string): Promise<boolean> {
    return this.blogsService.remove(id);
  }
}
