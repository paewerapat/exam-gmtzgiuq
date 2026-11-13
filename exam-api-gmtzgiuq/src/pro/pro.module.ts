import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/category.entity';
import { Exam } from '../exams/exam.entity';
import { User } from '../users/user.entity';
import { ProPage } from './pro-page.entity';
import { ProPlan } from './pro-plan.entity';
import { ProSubscription } from './pro-subscription.entity';
import { ProVenue } from './pro-venue.entity';
import { ProAccessService } from './pro-access.service';
import { ProConfigService } from './pro-config.service';
import { ProSubscriptionsService } from './pro-subscriptions.service';
import { ProController } from './pro.controller';

/**
 * Pro membership (task 17): venues, plans, the Upgrade page, subscriptions.
 * ProAccessService is exported for other modules (ExamAccessModule now).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProVenue,
      ProPlan,
      ProSubscription,
      ProPage,
      Category,
      Exam,
      User,
    ]),
  ],
  providers: [ProAccessService, ProConfigService, ProSubscriptionsService],
  controllers: [ProController],
  exports: [ProAccessService],
})
export class ProModule {}
