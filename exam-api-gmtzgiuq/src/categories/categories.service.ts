import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private repo: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.repo.find({ order: { orderIndex: 'ASC', name: 'ASC' } });
  }

  async findOne(id: string): Promise<Category> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async create(data: { name: string; slug: string; orderIndex?: number }): Promise<Category> {
    const existing = await this.repo.findOne({ where: { slug: data.slug } });
    if (existing) throw new ConflictException('Slug already exists');
    const cat = this.repo.create(data);
    return this.repo.save(cat);
  }

  async update(id: string, data: Partial<{ name: string; slug: string; orderIndex: number }>): Promise<Category> {
    const cat = await this.findOne(id);
    if (data.slug && data.slug !== cat.slug) {
      const existing = await this.repo.findOne({ where: { slug: data.slug } });
      if (existing) throw new ConflictException('Slug already exists');
    }
    Object.assign(cat, data);
    return this.repo.save(cat);
  }

  async remove(id: string): Promise<void> {
    const cat = await this.findOne(id);
    await this.repo.remove(cat);
  }
}
