import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from './exam.entity';
import { Question } from '../questions/question.entity';
import { ExamAttempt } from '../attempts/attempt.entity';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { UploadModule } from '../upload/upload.module';
import { ExamAccessModule } from '../exam-access/exam-access.module';
import { PredictedModule } from '../predicted/predicted.module';

@Module({
  imports: [
    // ExamAttempt: myProgress of the Mock Exam pages (task 21)
    TypeOrmModule.forFeature([Exam, Question, ExamAttempt]),
    UploadModule,
    ExamAccessModule,
    // Access of Predicted sets (task 22)
    PredictedModule,
  ],
  providers: [ExamsService],
  controllers: [ExamsController],
  exports: [ExamsService],
})
export class ExamsModule {}
