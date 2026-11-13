import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/category.entity';
import { Exam } from '../exams/exam.entity';
import { User } from '../users/user.entity';
import { ProCustomer } from './pro-customer.entity';
import { ProPage } from './pro-page.entity';
import { ProPayment } from './pro-payment.entity';
import { ProPlan } from './pro-plan.entity';
import { ProSubscription } from './pro-subscription.entity';
import { ProVenue } from './pro-venue.entity';
import { OmiseClient } from './omise.client';
import { ProAccessService } from './pro-access.service';
import { ProBillingService } from './pro-billing.service';
import { ProConfigService } from './pro-config.service';
import { ProPaymentsService } from './pro-payments.service';
import { ProSubscriptionsService } from './pro-subscriptions.service';
import { ProPaymentsController } from './pro-payments.controller';
import { ProController } from './pro.controller';

/**
 * Pro membership (task 17): venues, plans, the Upgrade page, subscriptions;
 * payments with Opn (task 18): checkout, webhook, renewals.
 * ProAccessService is exported for other modules (ExamAccessModule now).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProVenue,
      ProPlan,
      ProSubscription,
      ProPage,
      ProPayment,
      ProCustomer,
      Category,
      Exam,
      User,
    ]),
  ],
  providers: [
    OmiseClient,
    ProAccessService,
    ProBillingService,
    ProConfigService,
    ProSubscriptionsService,
    ProPaymentsService,
  ],
  controllers: [ProController, ProPaymentsController],
  exports: [ProAccessService],
})
export class ProModule {}
