import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamAttempt } from './attempt.entity';
import { Exam } from '../exams/exam.entity';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { ExamAccessModule } from '../exam-access/exam-access.module';
import { AnswerLogsModule } from '../answer-logs/answer-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamAttempt, Exam]),
    ExamAccessModule,
    AnswerLogsModule,
  ],
  providers: [AttemptsService],
  controllers: [AttemptsController],
  exports: [AttemptsService],
})
export class AttemptsModule {}
