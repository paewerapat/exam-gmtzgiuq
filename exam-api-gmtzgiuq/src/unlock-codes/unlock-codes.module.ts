import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from '../exams/exam.entity';
import { ExamAccessModule } from '../exam-access/exam-access.module';
import { UnlockCodeBatch } from './unlock-code-batch.entity';
import { UnlockCodeBatchExam } from './unlock-code-batch-exam.entity';
import { UnlockCode } from './unlock-code.entity';
import { UnlockCodeRedeemFailure } from './unlock-code-redeem-failure.entity';
import { UnlockCodesService } from './unlock-codes.service';
import { UnlockCodesController } from './unlock-codes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UnlockCodeBatch,
      UnlockCodeBatchExam,
      UnlockCode,
      UnlockCodeRedeemFailure,
      Exam,
    ]),
    ExamAccessModule,
  ],
  providers: [UnlockCodesService],
  controllers: [UnlockCodesController],
})
export class UnlockCodesModule {}
