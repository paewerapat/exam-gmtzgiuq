import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from '../questions/question.entity';
import { ProModule } from '../pro/pro.module';
import { ChallengeAccessService } from './challenge-access.service';

/**
 * Challenge rights (task 20), for the Question Bank and POST /answer-logs;
 * no routes of its own.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Question]), ProModule],
  providers: [ChallengeAccessService],
  exports: [ChallengeAccessService],
})
export class ChallengeAccessModule {}
