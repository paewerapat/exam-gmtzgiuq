import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProVenue } from '../pro/pro-venue.entity';
import { Subject } from '../curriculum/subject.entity';
import { Topic } from '../curriculum/topic.entity';
import { Question } from '../questions/question.entity';
import { QuestionsModule } from '../questions/questions.module';
import { ChallengeAccessModule } from './challenge-access.module';
import { QuestionBankService } from './question-bank.service';
import { QuestionBankController } from './question-bank.controller';

/** Question Bank and Challenge Questions (task 20). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProVenue, Subject, Topic, Question]),
    QuestionsModule,
    ChallengeAccessModule,
  ],
  providers: [QuestionBankService],
  controllers: [QuestionBankController],
})
export class QuestionBankModule {}
