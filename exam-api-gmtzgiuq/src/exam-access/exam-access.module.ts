import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from '../exams/exam.entity';
import { ExamAccess } from './exam-access.entity';
import { ExamAccessService } from './exam-access.service';
import { ProModule } from '../pro/pro.module';

/**
 * Access to locked Mock Exams (task 15; purchase ones also by Pro plans,
 * task 17); no routes of its own.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ExamAccess, Exam]), ProModule],
  providers: [ExamAccessService],
  exports: [ExamAccessService],
})
export class ExamAccessModule {}
