import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamAttempt } from './attempt.entity';
import { Exam } from '../exams/exam.entity';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExamAttempt, Exam])],
  providers: [AttemptsService],
  controllers: [AttemptsController],
  exports: [AttemptsService],
})
export class AttemptsModule {}
