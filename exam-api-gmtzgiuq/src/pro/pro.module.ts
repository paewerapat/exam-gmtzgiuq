import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/category.entity';
import { Exam } from '../exams/exam.entity';
import { User } from '../users/user.entity';
import { RedeemThrottleModule } from '../unlock-codes/redeem-throttle.module';
import { ProCustomer } from './pro-customer.entity';
import { ProDiscountCode } from './pro-discount-code.entity';
import { ProDiscountRedemption } from './pro-discount-redemption.entity';
import { ProPage } from './pro-page.entity';
import { ProPayment } from './pro-payment.entity';
import { ProPlan } from './pro-plan.entity';
import { ProSubscription } from './pro-subscription.entity';
import { ProVenue } from './pro-venue.entity';
import { OmiseClient } from './omise.client';
import { ProAccessService } from './pro-access.service';
import { ProBillingService } from './pro-billing.service';
import { ProConfigService } from './pro-config.service';
import { ProDiscountsService } from './pro-discounts.service';
import { ProPaymentsService } from './pro-payments.service';
import { ProSubscriptionsService } from './pro-subscriptions.service';
import { ProDiscountsController } from './pro-discounts.controller';
import { ProPaymentsController } from './pro-payments.controller';
import { ProController } from './pro.controller';

/**
 * Pro membership (task 17): venues, plans, the Upgrade page, subscriptions;
 * payments with Opn (task 18): checkout, webhook, renewals; discount codes
 * (task 19). ProAccessService is exported for other modules
 * (ExamAccessModule), ProSubscriptionsService for the Pro unlock codes
 * (UnlockCodesModule, task 19).
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
      ProDiscountCode,
      ProDiscountRedemption,
      Category,
      Exam,
      User,
    ]),
    RedeemThrottleModule,
  ],
  providers: [
    OmiseClient,
    ProAccessService,
    ProBillingService,
    ProConfigService,
    ProSubscriptionsService,
    ProDiscountsService,
    ProPaymentsService,
  ],
  controllers: [ProController, ProPaymentsController, ProDiscountsController],
  exports: [ProAccessService, ProSubscriptionsService],
})
export class ProModule {}
