import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { BlogsController } from './blogs.controller';
import { BlogsResolver } from './blogs.resolver';
import { BlogsService } from './blogs.service';
import { Blog } from './blog.entity';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { UserRole } from '../users/user.entity';

describe('Blog by slug — public REST and GraphQL (SEC-9)', () => {
  let controller: BlogsController;
  let resolver: BlogsResolver;
  let findBySlug: jest.Mock;
  const blog = { id: 'b1', slug: 'post' } as Blog;

  beforeEach(async () => {
    findBySlug = jest.fn().mockResolvedValue(blog);

    const module = await Test.createTestingModule({
      controllers: [BlogsController],
      providers: [
        BlogsResolver,
        { provide: BlogsService, useValue: { findBySlug } },
      ],
    }).compile();

    controller = module.get(BlogsController);
    resolver = module.get(BlogsResolver);
  });

  it.each([
    ['anonymous', null],
    ['a student', { role: UserRole.USER }],
  ])(
    'GET /blogs/slug/:slug for %s asks for published blogs only',
    async (_label, user) => {
      await expect(controller.findBySlug('post', { user })).resolves.toBe(blog);
      expect(findBySlug).toHaveBeenCalledWith('post', {
        includeDrafts: false,
      });
    },
  );

  it('GET /blogs/slug/:slug for an admin also opens drafts (admin preview)', async () => {
    await controller.findBySlug('post', { user: { role: UserRole.ADMIN } });
    expect(findBySlug).toHaveBeenCalledWith('post', { includeDrafts: true });
  });

  it('GET /blogs/slug/:slug reads the token without requiring it', () => {
    const handler = Object.getOwnPropertyDescriptor(
      BlogsController.prototype,
      'findBySlug',
    )?.value as object;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    expect(guards).toEqual([OptionalJwtAuthGuard]);
  });

  it('GraphQL blogBySlug asks for published blogs only', async () => {
    await expect(resolver.blogBySlug('post')).resolves.toBe(blog);
    expect(findBySlug).toHaveBeenCalledWith('post', { includeDrafts: false });
  });
});
