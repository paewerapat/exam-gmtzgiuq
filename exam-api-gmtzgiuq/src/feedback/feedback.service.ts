import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private feedbackRepository: Repository<Feedback>,
  ) {}

  async create(dto: CreateFeedbackDto, userId: string | null): Promise<Feedback> {
    const feedback = this.feedbackRepository.create({
      userId,
      examId: dto.examId ?? null,
      age: dto.age ?? null,
      message: dto.message,
      details: dto.details ?? null,
    });
    return this.feedbackRepository.save(feedback);
  }

  async findAll(
    page: number,
    limit: number,
  ): Promise<{
    items: Feedback[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const [items, total] = await this.feedbackRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // The User relation is eager-loaded for display purposes (name/email) —
    // strip the password hash so it never leaves the server in this response.
    for (const item of items) {
      if (item.user) {
        delete (item.user as { password?: string }).password;
      }
    }

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
