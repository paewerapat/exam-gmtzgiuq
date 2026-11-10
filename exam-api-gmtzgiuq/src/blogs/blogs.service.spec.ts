import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BlogsService } from './blogs.service';
import { Blog, BlogStatus } from './blog.entity';
import { UploadService } from '../upload/upload.service';

describe('BlogsService.findBySlug (SEC-9)', () => {
  let service: BlogsService;
  let findOne: jest.Mock;
  let increment: jest.Mock;

  // Mimics the DB: findOne matches every key in `where`.
  const rows = [
    { id: 'b-pub', slug: 'published-post', status: BlogStatus.PUBLISHED },
    { id: 'b-draft', slug: 'draft-post', status: BlogStatus.DRAFT },
  ] as Blog[];

  beforeEach(async () => {
    findOne = jest.fn(({ where }: { where: Partial<Blog> }) =>
      Promise.resolve(
        rows.find((r) =>
          Object.entries(where).every(([k, v]) => r[k as keyof Blog] === v),
        ) ?? null,
      ),
    );
    increment = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogsService,
        {
          provide: getRepositoryToken(Blog),
          useValue: { findOne, increment },
        },
        { provide: UploadService, useValue: {} },
      ],
    }).compile();

    service = module.get(BlogsService);
  });

  it('returns a published blog and counts the view', async () => {
    await expect(service.findBySlug('published-post')).resolves.toEqual(
      rows[0],
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { slug: 'published-post', status: BlogStatus.PUBLISHED },
      relations: ['author'],
    });
    expect(increment).toHaveBeenCalledWith({ id: 'b-pub' }, 'viewCount', 1);
  });

  it('404 for a draft by default (public page, GraphQL blogBySlug)', async () => {
    await expect(service.findBySlug('draft-post')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.findBySlug('draft-post', { includeDrafts: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(increment).not.toHaveBeenCalled();
  });

  it('404 for a slug that does not exist', async () => {
    await expect(service.findBySlug('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('includeDrafts (admin preview) returns a draft without counting a view', async () => {
    await expect(
      service.findBySlug('draft-post', { includeDrafts: true }),
    ).resolves.toEqual(rows[1]);
    expect(findOne).toHaveBeenCalledWith({
      where: { slug: 'draft-post' },
      relations: ['author'],
    });
    expect(increment).not.toHaveBeenCalled();
  });

  it('includeDrafts still counts views of a published blog', async () => {
    await service.findBySlug('published-post', { includeDrafts: true });
    expect(increment).toHaveBeenCalledTimes(1);
  });
});
