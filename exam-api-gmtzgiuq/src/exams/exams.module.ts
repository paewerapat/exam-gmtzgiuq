import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from './exam.entity';
import { Question } from '../questions/question.entity';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { UploadModule } from '../upload/upload.module';
import { ExamAccessModule } from '../exam-access/exam-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Exam, Question]),
    UploadModule,
    ExamAccessModule,
  ],
  providers: [ExamsService],
  controllers: [ExamsController],
  exports: [ExamsService],
})
export class ExamsModule {}
