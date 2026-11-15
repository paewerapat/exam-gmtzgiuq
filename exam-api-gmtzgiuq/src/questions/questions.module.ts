import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './question.entity';
import { Exam } from '../exams/exam.entity';
import { QuestionsService } from './questions.service';
import { QuestionsResolver } from './questions.resolver';
import { QuestionsController } from './questions.controller';
import { UploadModule } from '../upload/upload.module';
import { PredictedSet } from '../predicted/predicted-set.entity';

@Module({
  // PredictedSet: questions of Predicted sets stay out of the public
  // question endpoints (task 22)
  imports: [
    TypeOrmModule.forFeature([Question, Exam, PredictedSet]),
    UploadModule,
  ],
  providers: [QuestionsService, QuestionsResolver],
  controllers: [QuestionsController],
  exports: [QuestionsService],
})
export class QuestionsModule {}
