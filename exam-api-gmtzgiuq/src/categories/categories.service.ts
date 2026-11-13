import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { ProVenue } from '../pro/pro-venue.entity';
import { ProException } from '../pro/pro-errors';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private repo: Repository<Category>,
    @InjectRepository(ProVenue)
    private venuesRepo: Repository<ProVenue>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.repo.find({ order: { orderIndex: 'ASC', name: 'ASC' } });
  }

  async findOne(id: string): Promise<Category> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async create(data: CreateCategoryDto): Promise<Category> {
    const existing = await this.repo.findOne({ where: { slug: data.slug } });
    if (existing) throw new ConflictException('Slug already exists');
    if (data.venueId) await this.assertVenueExists(data.venueId);
    const cat = this.repo.create({
      name: data.name,
      slug: data.slug,
      ...(data.orderIndex !== undefined && { orderIndex: data.orderIndex }),
      venueId: data.venueId ?? null,
    });
    return this.repo.save(cat);
  }

  async update(id: string, data: UpdateCategoryDto): Promise<Category> {
    const cat = await this.findOne(id);
    if (data.slug && data.slug !== cat.slug) {
      const existing = await this.repo.findOne({ where: { slug: data.slug } });
      if (existing) throw new ConflictException('Slug already exists');
    }
    if (data.venueId) await this.assertVenueExists(data.venueId);
    if (data.name !== undefined) cat.name = data.name;
    if (data.slug !== undefined) cat.slug = data.slug;
    if (data.orderIndex !== undefined) cat.orderIndex = data.orderIndex;
    // null = no venue; not sent = unchanged
    if (data.venueId !== undefined) cat.venueId = data.venueId ?? null;
    return this.repo.save(cat);
  }

  async remove(id: string): Promise<void> {
    const cat = await this.findOne(id);
    await this.repo.remove(cat);
  }

  /** 404 VENUE_NOT_FOUND (Thai, errorCode) when no such Pro venue. */
  private async assertVenueExists(venueId: string): Promise<void> {
    const exists = await this.venuesRepo.exists({ where: { id: venueId } });
    if (!exists) throw new ProException('VENUE_NOT_FOUND');
  }
}
