import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './question.entity';
import { Exam } from '../exams/exam.entity';
import { QuestionsService } from './questions.service';
import { QuestionsResolver } from './questions.resolver';
import { QuestionsController } from './questions.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([Question, Exam]), UploadModule],
  providers: [QuestionsService, QuestionsResolver],
  controllers: [QuestionsController],
  exports: [QuestionsService],
})
export class QuestionsModule {}
