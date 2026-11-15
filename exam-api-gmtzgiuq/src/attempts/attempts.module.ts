import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamAttempt } from './attempt.entity';
import { Exam } from '../exams/exam.entity';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { ExamAccessModule } from '../exam-access/exam-access.module';
import { PredictedModule } from '../predicted/predicted.module';
import { AnswerLogsModule } from '../answer-logs/answer-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamAttempt, Exam]),
    ExamAccessModule,
    // Access of Predicted sets (task 22)
    PredictedModule,
    AnswerLogsModule,
  ],
  providers: [AttemptsService],
  controllers: [AttemptsController],
  exports: [AttemptsService],
})
export class AttemptsModule {}
