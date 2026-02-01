import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Blog, BlogStatus } from './blog.entity';
import {
  CreateBlogInput,
  UpdateBlogInput,
  PaginatedBlogs,
} from './dto/blog.dto';
import { User } from '../users/user.entity';

@Injectable()
export class BlogsService {
  constructor(
    @InjectRepository(Blog)
    private blogsRepository: Repository<Blog>,
  ) {}

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  async create(createBlogInput: CreateBlogInput, author: User): Promise<Blog> {
    const slug =
      createBlogInput.slug || this.generateSlug(createBlogInput.title);

    // Check if slug already exists
    const existingBlog = await this.blogsRepository.findOne({
      where: { slug },
    });
    if (existingBlog) {
      throw new ConflictException('A blog with this slug already exists');
    }

    const blog = this.blogsRepository.create({
      ...createBlogInput,
      slug,
      author,
      authorId: author.id,
      publishedAt:
        createBlogInput.status === BlogStatus.PUBLISHED
          ? new Date()
          : undefined,
    });

    return await this.blogsRepository.save(blog);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: BlogStatus,
  ): Promise<PaginatedBlogs> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.blogsRepository
      .createQueryBuilder('blog')
      .leftJoinAndSelect('blog.author', 'author')
      .orderBy('blog.createdAt', 'DESC');

    if (status) {
      queryBuilder.where('blog.status = :status', { status });
    }

    const [items, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublished(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedBlogs> {
    return this.findAll(page, limit, BlogStatus.PUBLISHED);
  }

  async findOne(id: string): Promise<Blog> {
    const blog = await this.blogsRepository.findOne({
      where: { id },
      relations: ['author'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    return blog;
  }

  async findBySlug(slug: string): Promise<Blog> {
    const blog = await this.blogsRepository.findOne({
      where: { slug },
      relations: ['author'],
    });

    if (!blog) {
      throw new NotFoundException('Blog not found');
    }

    // Increment view count
    await this.blogsRepository.increment({ id: blog.id }, 'viewCount', 1);

    return blog;
  }

  async update(id: string, updateBlogInput: UpdateBlogInput): Promise<Blog> {
    const blog = await this.findOne(id);

    // Check slug uniqueness if changing
    if (updateBlogInput.slug && updateBlogInput.slug !== blog.slug) {
      const existingBlog = await this.blogsRepository.findOne({
        where: { slug: updateBlogInput.slug },
      });
      if (existingBlog) {
        throw new ConflictException('A blog with this slug already exists');
      }
    }

    // Set publishedAt if status changes to published
    if (
      updateBlogInput.status === BlogStatus.PUBLISHED &&
      blog.status !== BlogStatus.PUBLISHED
    ) {
      Object.assign(blog, { publishedAt: new Date() });
    }

    Object.assign(blog, updateBlogInput);
    return this.blogsRepository.save(blog);
  }

  async remove(id: string): Promise<boolean> {
    const blog = await this.findOne(id);
    await this.blogsRepository.remove(blog);
    return true;
  }

  async getStats(): Promise<{
    total: number;
    published: number;
    draft: number;
  }> {
    const total = await this.blogsRepository.count();
    const published = await this.blogsRepository.count({
      where: { status: BlogStatus.PUBLISHED },
    });
    const draft = await this.blogsRepository.count({
      where: { status: BlogStatus.DRAFT },
    });

    return { total, published, draft };
  }
}
