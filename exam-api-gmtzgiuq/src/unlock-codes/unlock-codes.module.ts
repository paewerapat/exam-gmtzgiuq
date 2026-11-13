import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from '../exams/exam.entity';
import { ExamAccessModule } from '../exam-access/exam-access.module';
import { ProModule } from '../pro/pro.module';
import { ProPlan } from '../pro/pro-plan.entity';
import { UnlockCodeBatch } from './unlock-code-batch.entity';
import { UnlockCodeBatchExam } from './unlock-code-batch-exam.entity';
import { UnlockCode } from './unlock-code.entity';
import { UnlockCodeRedeemFailure } from './unlock-code-redeem-failure.entity';
import { UnlockCodesService } from './unlock-codes.service';
import { UnlockCodesController } from './unlock-codes.controller';
import { RedeemThrottleModule } from './redeem-throttle.module';

/**
 * Unlock codes (task 15); Pro campaigns (task 19) give a plan through
 * ProModule's ProSubscriptionsService. The redeem limit lives in
 * RedeemThrottleModule (shared with the discount codes of ProModule).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UnlockCodeBatch,
      UnlockCodeBatchExam,
      UnlockCode,
      UnlockCodeRedeemFailure,
      Exam,
      ProPlan,
    ]),
    ExamAccessModule,
    ProModule,
    RedeemThrottleModule,
  ],
  providers: [UnlockCodesService],
  controllers: [UnlockCodesController],
})
export class UnlockCodesModule {}
