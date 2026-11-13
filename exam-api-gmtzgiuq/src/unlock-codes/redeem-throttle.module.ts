import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnlockCodeRedeemFailure } from './unlock-code-redeem-failure.entity';
import { RedeemThrottleService } from './redeem-throttle.service';

/**
 * The code-typing limit (task 15) on its own, so the Pro checkout (task 19)
 * can count discount code guesses in the same table without importing the
 * unlock codes module (which imports ProModule).
 */
@Module({
  imports: [TypeOrmModule.forFeature([UnlockCodeRedeemFailure])],
  providers: [RedeemThrottleService],
  exports: [RedeemThrottleService],
})
export class RedeemThrottleModule {}
