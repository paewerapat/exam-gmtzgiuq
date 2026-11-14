import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuestionAnswer } from './question-answer.entity';
import { Question } from '../questions/question.entity';
import { Exam } from '../exams/exam.entity';
import { AnswerLogsService } from './answer-logs.service';
import { AnswerLogsController } from './answer-logs.controller';
import { ExamAccessModule } from '../exam-access/exam-access.module';
import { ChallengeAccessModule } from '../question-bank/challenge-access.module';

/** Per-question answer log (task 16), also used by AttemptsModule. */
@Module({
  imports: [
    TypeOrmModule.forFeature([QuestionAnswer, Question, Exam]),
    ExamAccessModule,
    ChallengeAccessModule,
  ],
  providers: [AnswerLogsService],
  controllers: [AnswerLogsController],
  exports: [AnswerLogsService],
})
export class AnswerLogsModule {}
