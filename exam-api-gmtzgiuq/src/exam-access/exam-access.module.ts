import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from '../exams/exam.entity';
import { ExamAccess } from './exam-access.entity';
import { ExamAccessService } from './exam-access.service';

/** Access to locked Mock Exams (task 15); no routes of its own. */
@Module({
  imports: [TypeOrmModule.forFeature([ExamAccess, Exam])],
  providers: [ExamAccessService],
  exports: [ExamAccessService],
})
export class ExamAccessModule {}
