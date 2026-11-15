import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from '../exams/exam.entity';
import { Question } from '../questions/question.entity';
import { ExamAttempt } from '../attempts/attempt.entity';
import { Subject } from '../curriculum/subject.entity';
import { ProVenue } from '../pro/pro-venue.entity';
import { ProModule } from '../pro/pro.module';
import { PredictedSeries } from './predicted-series.entity';
import { PredictedSet } from './predicted-set.entity';
import { PredictedAccessService } from './predicted-access.service';
import { PredictedService } from './predicted.service';
import { PredictedController } from './predicted.controller';
import { PredictedAdminController } from './predicted-admin.controller';

/**
 * Predicted Exam (task 22): series / sets, GET /predicted and
 * /admin/predicted/*. PredictedAccessService is exported for the exam,
 * attempt and answer-log modules (access of a Predicted set).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PredictedSeries,
      PredictedSet,
      Exam,
      Question,
      ExamAttempt,
      Subject,
      ProVenue,
    ]),
    ProModule,
  ],
  providers: [PredictedAccessService, PredictedService],
  controllers: [PredictedController, PredictedAdminController],
  exports: [PredictedAccessService],
})
export class PredictedModule {}
