/**
 * Uses of discount codes inside the caller's transaction (task 19): count,
 * reserve with a pending payment, mark used when its charge is successful
 * (ProBillingService, the single verified-charge path), release when it
 * failed / expired / was replaced. Lock order of every caller: users →
 * pro_venues → pro_plans → pro_discount_codes (FOR UPDATE) → payments /
 * subscriptions / redemptions.
 */
import { randomUUID } from 'crypto';
import { EntityManager, In } from 'typeorm';
import { ProDiscountCode } from './pro-discount-code.entity';
import {
  ProDiscountRedemption,
  ProDiscountRedemptionStatus,
} from './pro-discount-redemption.entity';
import { ProPayment } from './pro-payment.entity';
import { isLiveReservation } from './pro-discount-rules';

export interface DiscountUses {
  // used + live reserved, every user
  total: number;
  // the same for one user
  mine: number;
}

/**
 * Uses of a code that count toward its limits: used, plus reserved while
 * the payment is pending (isLiveReservation). `excludePaymentIds`: the
 * caller's own pending payments that a new checkout replaces.
 * Inside checkout the code row is locked FOR UPDATE before the first plain
 * read of the transaction, so these reads see every reservation committed
 * by the checkouts that held the lock before.
 */
export async function countDiscountUses(
  manager: EntityManager,
  codeId: string,
  userId: string,
  now: Date,
  excludePaymentIds: string[] = [],
): Promise<DiscountUses> {
  const used = await manager.count(ProDiscountRedemption, {
    where: { codeId, status: ProDiscountRedemptionStatus.USED },
  });
  const usedMine = await manager.count(ProDiscountRedemption, {
    where: { codeId, userId, status: ProDiscountRedemptionStatus.USED },
  });
  const reserved = (
    await manager.find(ProDiscountRedemption, {
      select: { id: true, userId: true, paymentId: true },
      where: { codeId, status: ProDiscountRedemptionStatus.RESERVED },
    })
  ).filter((r) => !excludePaymentIds.includes(r.paymentId));
  const payments =
    reserved.length > 0
      ? await manager.find(ProPayment, {
          select: { id: true, status: true, expiresAt: true, createdAt: true },
          where: { id: In(reserved.map((r) => r.paymentId)) },
        })
      : [];
  const live = reserved.filter((r) =>
    isLiveReservation(
      payments.find((p) => p.id === r.paymentId),
      now,
    ),
  );
  return {
    total: used + live.length,
    mine: usedMine + live.filter((r) => r.userId === userId).length,
  };
}

/** A reserved use for the pending payment (same transaction as the payment). */
export async function reserveDiscount(
  manager: EntityManager,
  input: {
    codeId: string;
    userId: string;
    paymentId: string;
    amountSatang: number;
  },
): Promise<void> {
  await manager.insert(ProDiscountRedemption, {
    id: randomUUID(),
    codeId: input.codeId,
    userId: input.userId,
    paymentId: input.paymentId,
    amountSatang: input.amountSatang,
    status: ProDiscountRedemptionStatus.RESERVED,
  });
}

/**
 * The reserved uses of these payments → released (failed / expired /
 * replaced). By the unique paymentId index, one row each.
 */
export async function releaseDiscounts(
  manager: Pick<EntityManager, 'update'>,
  paymentIds: string[],
): Promise<void> {
  for (const paymentId of new Set(paymentIds)) {
    await manager.update(
      ProDiscountRedemption,
      { paymentId, status: ProDiscountRedemptionStatus.RESERVED },
      { status: ProDiscountRedemptionStatus.RELEASED },
    );
  }
}

/**
 * The payment's charge was successful: its use → used (also from released:
 * the money was taken at the discounted amount, so the use stands) and the
 * code's redeemedCount + 1, once. The code row is locked FOR UPDATE first
 * (after the venue / plan locks of the caller).
 */
export async function markDiscountUsed(
  manager: EntityManager,
  payment: { id: string; discountCodeId: string | null },
): Promise<void> {
  if (!payment.discountCodeId) return;
  const code = await manager.findOne(ProDiscountCode, {
    select: { id: true, redeemedCount: true },
    where: { id: payment.discountCodeId },
    lock: { mode: 'pessimistic_write' },
  });
  const use = await manager.findOne(ProDiscountRedemption, {
    select: { id: true, status: true },
    where: { paymentId: payment.id },
  });
  if (!use || use.status === String(ProDiscountRedemptionStatus.USED)) return;
  await manager.update(
    ProDiscountRedemption,
    { id: use.id },
    { status: ProDiscountRedemptionStatus.USED },
  );
  if (code) {
    await manager.update(
      ProDiscountCode,
      { id: code.id },
      { redeemedCount: Number(code.redeemedCount ?? 0) + 1 },
    );
  }
}
