import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ProCustomer } from './pro-customer.entity';
import {
  ProPayment,
  ProPaymentMethod,
  ProPaymentStatus,
} from './pro-payment.entity';
import { ProPlan } from './pro-plan.entity';
import {
  ProSubscription,
  ProSubscriptionSource,
  ProSubscriptionStatus,
} from './pro-subscription.entity';
import { ProVenue } from './pro-venue.entity';
import { ProException, isDuplicateKey } from './pro-errors';
import { withUserLock } from './pro-user-lock';
import {
  OmiseCard,
  OmiseCharge,
  OmiseClient,
  OmiseCustomer,
  OmiseError,
  isOmiseId,
} from './omise.client';
import {
  EXPIRED_MESSAGE,
  REFUND_NOTE,
  RENEWAL_GRACE_MS,
  SCHEDULE_YEARS,
  addDays,
  addYearsToDate,
  bangkokDate,
  clip,
  floorToSecond,
  parseOmiseDate,
  thaiFailureMessage,
} from './pro-payment-format';

/** What syncCharge did with a charge read from Opn. */
export interface ChargeOutcome {
  handled: boolean;
  paymentId?: string;
  status?: string;
  // why it was left alone (handled = false)
  reason?: string;
}

/** Opn calls that run after the transaction committed. */
interface AfterCommit {
  // schedules of subscriptions that were ended
  deleteSchedules: string[];
  // schedules that must stop charging (failed renewal, a renewal that was
  // not accepted): could not be deleted → ERROR log, delete it by hand
  stopSchedules: string[];
  // first card payment of a subscription → make its renewal schedule
  createSchedule: { subscriptionId: string; paymentId: string } | null;
}

/** The user's Opn customer and the card to charge now. */
export interface CustomerCard {
  customerId: string;
  cardId: string;
  cardBrand: string | null;
  cardLastDigits: string | null;
}

/** Results of Opn calls kept across the retries of withUserLock. */
export interface CustomerMemo {
  customer?: OmiseCustomer;
}

const bool = (value: unknown) => value === true || Number(value) === 1;

/** The schedule a charge came from (a valid Opn id), or null. */
function scheduleOf(charge: OmiseCharge): string | null {
  return isOmiseId('schedule', charge.schedule) ? charge.schedule : null;
}

/** The card a charge used, as stored on a subscription. */
function cardOf(charge: OmiseCharge): {
  cardBrand: string | null;
  cardLastDigits: string | null;
  omiseCardId: string | null;
} | null {
  const card = charge.card;
  if (!card) return null;
  return {
    cardBrand: clip(card.brand, 30),
    cardLastDigits: clip(card.last_digits, 4),
    omiseCardId: clip(card.id, 64),
  };
}

/** A payment row as inserted (dates are filled by the DB). */
export type NewPayment = Omit<ProPayment, 'createdAt' | 'updatedAt'>;

const FINAL_FAILED = ['failed', 'expired', 'reversed'];

function emptyAfterCommit(): AfterCommit {
  return { deleteSchedules: [], stopSchedules: [], createSchedule: null };
}

/** The card a customer charges by default (else its newest card). */
export function defaultCardOf(customer: OmiseCustomer): OmiseCard | null {
  const cards = customer.cards?.data ?? [];
  return cards.find((c) => c.id === customer.default_card) ?? newestCard(cards);
}

function newestCard(cards: OmiseCard[]): OmiseCard | null {
  let best: OmiseCard | null = null;
  for (const card of cards) {
    if (!best || (card.created_at ?? '') >= (best.created_at ?? '')) {
      best = card;
    }
  }
  return best;
}

/** The PromptPay QR image of a charge. */
export function qrImageOf(charge: OmiseCharge): string | null {
  const uri = charge.source?.scannable_code?.image?.download_uri;
  return typeof uri === 'string' && uri.startsWith('https://') ? uri : null;
}

/** A charge read from Opn is for this payment row (amount, currency, id). */
export function chargeMatchesPayment(
  payment: Pick<ProPayment, 'totalSatang' | 'currency' | 'omiseChargeId'>,
  charge: OmiseCharge,
): boolean {
  return (
    Number(charge.amount) === payment.totalSatang &&
    String(charge.currency ?? '').toUpperCase() ===
      String(payment.currency ?? '').toUpperCase() &&
    (!payment.omiseChargeId || payment.omiseChargeId === charge.id)
  );
}

/**
 * Payments with Opn (task 18), the parts every way in shares:
 *
 * - **syncCharge(chargeId)** is the only way a payment becomes successful /
 *   failed / expired and rights are opened or renewed: it always reads the
 *   charge from Opn (never trusts a request body), checks it belongs to the
 *   payment (metadata.paymentId, amount, currency, charge id), and applies
 *   it once under the user's lock. Used by checkout, GET /pro/payments/:id
 *   (poll after 3-D Secure / PromptPay), the webhook, and renewals charged
 *   by a schedule (no paymentId: found by the schedule id or
 *   metadata.subscriptionId, one payment row per charge — omiseChargeId is
 *   UNIQUE). Status only moves forward (pending → final), so events that
 *   repeat or come out of order change nothing.
 * - HTTP to Opn never runs inside these transactions except the customer
 *   step of checkout (memoized, so a deadlock retry does not repeat it).
 *   Schedules are made / deleted after the commit.
 *
 * Lock order: users → pro_venues (S) → pro_plans (S) → pro_payments /
 * pro_subscriptions, the same as the admin grant (task 17).
 */
@Injectable()
export class ProBillingService {
  private readonly logger = new Logger(ProBillingService.name);

  constructor(
    @InjectRepository(ProPayment)
    private paymentsRepository: Repository<ProPayment>,
    @InjectRepository(ProSubscription)
    private subscriptionsRepository: Repository<ProSubscription>,
    @InjectRepository(ProCustomer)
    private customersRepository: Repository<ProCustomer>,
    @InjectRepository(ProPlan)
    private plansRepository: Repository<ProPlan>,
    @InjectRepository(ProVenue)
    private venuesRepository: Repository<ProVenue>,
    private dataSource: DataSource,
    private omise: OmiseClient,
  ) {}

  // ── the single path from an Opn charge to rights ────────────────────

  /**
   * Read the charge from Opn and apply it (see the class comment).
   * `expectedPaymentId`: the caller knows which payment it is for (poll /
   * checkout); a charge whose metadata names another payment is ignored.
   * Throws OmiseError when Opn cannot be asked.
   */
  async syncCharge(
    chargeId: string,
    expectedPaymentId?: string,
  ): Promise<ChargeOutcome> {
    const charge = await this.omise.getCharge(chargeId);
    return this.applyCharge(charge, expectedPaymentId);
  }

  /**
   * Apply a charge object that came from Opn itself (GET /charges/:id, or
   * the answer to our own POST /charges). Never call it with data from a
   * request body.
   */
  async applyCharge(
    charge: OmiseCharge,
    expectedPaymentId?: string,
    now: Date = new Date(),
  ): Promise<ChargeOutcome> {
    if (
      !charge ||
      charge.object !== 'charge' ||
      !isOmiseId('charge', charge.id)
    ) {
      return { handled: false, reason: 'not_a_charge' };
    }
    const meta = charge.metadata ?? {};
    const paymentId =
      typeof meta.paymentId === 'string' && isUUID(meta.paymentId)
        ? meta.paymentId
        : null;
    if (expectedPaymentId !== undefined && paymentId !== expectedPaymentId) {
      this.logger.warn(`charge ${charge.id} is not for this payment`);
      return { handled: false, reason: 'payment_mismatch' };
    }
    if (paymentId) return this.applyToPayment(paymentId, charge, now);
    if (
      isOmiseId('schedule', charge.schedule) ||
      typeof meta.subscriptionId === 'string'
    ) {
      return this.applyRenewal(charge, now);
    }
    return { handled: false, reason: 'not_ours' };
  }

  /** A charge made by checkout (metadata.paymentId). */
  private async applyToPayment(
    paymentId: string,
    charge: OmiseCharge,
    now: Date,
  ): Promise<ChargeOutcome> {
    const found = await this.paymentsRepository.findOne({
      select: { id: true, userId: true },
      where: { id: paymentId },
    });
    if (!found) return { handled: false, reason: 'payment_not_found' };

    let after = emptyAfterCommit();
    const status = await withUserLock(
      this.dataSource,
      found.userId,
      async (manager) => {
        after = emptyAfterCommit();
        const payment = await manager.findOne(ProPayment, {
          where: { id: paymentId },
        });
        if (!payment) return null;
        if (!chargeMatchesPayment(payment, charge)) {
          this.logger.warn(
            `charge ${charge.id} does not match payment ${payment.id} (amount/currency/charge id) - ignored`,
          );
          return null;
        }
        return this.applyLocked(manager, payment, charge, after, now);
      },
    );
    await this.runAfterCommit(after);
    if (status === null) return { handled: false, reason: 'mismatch' };
    return { handled: true, paymentId, status };
  }

  /**
   * A charge without paymentId: a renewal charged by an Opn schedule. Found
   * by the schedule id (also kept on its payments after the schedule was
   * removed from the subscription), else metadata.subscriptionId; the
   * charge's customer must be the user's customer. One payment row per
   * charge (made here, isRenewal).
   */
  private async applyRenewal(
    charge: OmiseCharge,
    now: Date,
  ): Promise<ChargeOutcome> {
    const subscription = await this.findRenewedSubscription(charge);
    if (!subscription) {
      this.logger.warn(`charge ${charge.id}: no subscription for it - ignored`);
      return { handled: false, reason: 'subscription_not_found' };
    }
    const customer = await this.customersRepository.findOne({
      where: { userId: subscription.userId },
    });
    if (!customer || customer.omiseCustomerId !== charge.customer) {
      this.logger.warn(
        `charge ${charge.id}: customer is not the subscription owner's - ignored`,
      );
      return { handled: false, reason: 'customer_mismatch' };
    }

    let after = emptyAfterCommit();
    let paymentId: string | undefined;
    let status: string | null;
    try {
      status = await withUserLock(
        this.dataSource,
        subscription.userId,
        async (manager) => {
          after = emptyAfterCommit();
          const existing = await manager.findOne(ProPayment, {
            where: { omiseChargeId: charge.id },
          });
          if (existing) {
            paymentId = existing.id;
            if (!chargeMatchesPayment(existing, charge)) return null;
            return this.applyLocked(manager, existing, charge, after, now);
          }
          const sub = await manager.findOne(ProSubscription, {
            where: { id: subscription.id },
          });
          if (!sub) return null;
          const template = sub.lastPaymentId
            ? await manager.findOne(ProPayment, {
                where: { id: sub.lastPaymentId },
              })
            : null;
          const amount = Number(charge.amount);
          // The split of the payment the schedule charges again
          const base = template?.totalSatang === amount ? template : null;
          const payment: NewPayment = {
            id: randomUUID(),
            userId: sub.userId,
            venueId: sub.venueId,
            planId: sub.planId,
            subscriptionId: sub.id,
            method: ProPaymentMethod.CARD,
            status: ProPaymentStatus.PENDING,
            isRenewal: true,
            subtotalSatang: base ? base.subtotalSatang : amount,
            vatSatang: base ? base.vatSatang : 0,
            discountSatang: base ? base.discountSatang : 0,
            totalSatang: amount,
            currency: String(charge.currency ?? 'THB')
              .toUpperCase()
              .slice(0, 3),
            omiseChargeId: charge.id,
            omiseScheduleId: isOmiseId('schedule', charge.schedule)
              ? charge.schedule
              : sub.omiseScheduleId,
            failureCode: null,
            failureMessage: null,
            qrImageUrl: null,
            expiresAt: null,
            paidAt: null,
            periodStart: null,
            periodEnd: null,
            discountCodeId: null,
            refundRequired: false,
            lastCheckedAt: null,
          };
          await manager.insert(ProPayment, payment);
          paymentId = payment.id;
          return this.applyLocked(manager, payment, charge, after, now);
        },
      );
    } catch (err) {
      // Another process made the row for this charge first
      if (isDuplicateKey(err)) {
        return { handled: true, reason: 'already_recorded' };
      }
      throw err;
    }
    await this.runAfterCommit(after);
    if (status === null) return { handled: false, reason: 'mismatch' };
    return { handled: true, paymentId, status };
  }

  private async findRenewedSubscription(
    charge: OmiseCharge,
  ): Promise<ProSubscription | null> {
    if (isOmiseId('schedule', charge.schedule)) {
      const bySchedule = await this.subscriptionsRepository.findOne({
        where: { omiseScheduleId: charge.schedule },
      });
      if (bySchedule) return bySchedule;
      // The schedule was removed from the row (canceled / failed renewal /
      // never saved): its payments still name it
      const payments = await this.paymentsRepository.find({
        select: { id: true, subscriptionId: true },
        where: { omiseScheduleId: charge.schedule },
        order: { createdAt: 'DESC' },
        take: 10,
      });
      const payment = payments.find((p) => !!p.subscriptionId);
      if (payment?.subscriptionId) {
        const sub = await this.subscriptionsRepository.findOne({
          where: { id: payment.subscriptionId },
        });
        if (sub) return sub;
      }
    }
    const subscriptionId = charge.metadata?.subscriptionId;
    if (typeof subscriptionId === 'string' && isUUID(subscriptionId)) {
      return this.subscriptionsRepository.findOne({
        where: { id: subscriptionId },
      });
    }
    return null;
  }

  /**
   * Apply the charge to the locked payment row. Only a pending payment
   * changes (also a failed/expired one that never got a charge id, when
   * its charge turns out successful: the money was taken, so the rights
   * are given). Returns the payment's status afterwards.
   */
  private async applyLocked(
    manager: EntityManager,
    payment: NewPayment,
    charge: OmiseCharge,
    after: AfterCommit,
    now: Date,
  ): Promise<string> {
    const changes: Partial<ProPayment> = {};
    if (!payment.omiseChargeId) changes.omiseChargeId = charge.id;
    if (payment.method === String(ProPaymentMethod.PROMPTPAY)) {
      const qr = qrImageOf(charge);
      if (qr && !payment.qrImageUrl) changes.qrImageUrl = clip(qr, 500);
      const expiresAt = parseOmiseDate(charge.expires_at);
      if (expiresAt && !payment.expiresAt) changes.expiresAt = expiresAt;
    }

    const pending = payment.status === String(ProPaymentStatus.PENDING);
    const unlinkedFailure =
      !payment.omiseChargeId &&
      (payment.status === String(ProPaymentStatus.FAILED) ||
        payment.status === String(ProPaymentStatus.EXPIRED));

    if (charge.status === 'successful' && (pending || unlinkedFailure)) {
      Object.assign(
        changes,
        await this.activateLocked(manager, payment, charge, after, now),
      );
    } else if (pending && FINAL_FAILED.includes(charge.status)) {
      const expired = charge.status === 'expired';
      changes.status = expired
        ? ProPaymentStatus.EXPIRED
        : ProPaymentStatus.FAILED;
      changes.failureCode = clip(charge.failure_code ?? charge.status, 64);
      changes.failureMessage =
        expired && !charge.failure_code
          ? EXPIRED_MESSAGE
          : thaiFailureMessage(charge.failure_code, payment.method);
      if (payment.isRenewal) {
        await this.stopFailedRenewal(manager, payment, charge, after, now);
      }
    }

    if (Object.keys(changes).length > 0) {
      await manager.update(ProPayment, { id: payment.id }, changes);
    }
    return changes.status ?? payment.status;
  }

  /**
   * A renewal charge failed: auto renewal stops (the schedule is deleted
   * after the commit, so Opn does not try again and charge later), the row
   * keeps its rights until currentPeriodEnd and is marked renewalFailedAt;
   * the user renews by hand. A schedule of the charge that is not the row's
   * own is deleted too.
   */
  private async stopFailedRenewal(
    manager: EntityManager,
    payment: NewPayment,
    charge: OmiseCharge,
    after: AfterCommit,
    now: Date,
  ): Promise<void> {
    const at = floorToSecond(now);
    const chargeSchedule = scheduleOf(charge);
    const sub = payment.subscriptionId
      ? await manager.findOne(ProSubscription, {
          where: { id: payment.subscriptionId },
        })
      : null;
    if (sub && (!chargeSchedule || chargeSchedule === sub.omiseScheduleId)) {
      await manager.update(
        ProSubscription,
        { id: sub.id },
        { autoRenew: false, canceledAt: at, renewalFailedAt: at },
      );
      if (sub.omiseScheduleId) after.stopSchedules.push(sub.omiseScheduleId);
    }
    if (chargeSchedule && chargeSchedule !== sub?.omiseScheduleId) {
      after.stopSchedules.push(chargeSchedule);
    }
  }

  /**
   * A successful charge: open or renew the rights, returns the changes of
   * the payment. Locks venue S → plan S (after the user lock).
   * - renewal (isRenewal): +periodDays from the end (or from now when it
   *   already passed) — only for the row's own auto renewal: the row active,
   *   autoRenew on, not past its end + 3 days, and the charge's schedule
   *   (when it has one) the row's schedule. Otherwise the money is recorded
   *   with refundRequired, nothing is extended, the schedule is deleted.
   * - an active row of the same plan → +periodDays from its end
   * - else the venue's active rows end (running → revoked, past → expired;
   *   their schedules are deleted after the commit) and a new row starts now
   * A card payment of a row without a schedule makes one after the commit.
   */
  private async activateLocked(
    manager: EntityManager,
    payment: NewPayment,
    charge: OmiseCharge,
    after: AfterCommit,
    now: Date,
  ): Promise<Partial<ProPayment>> {
    const at = floorToSecond(now);
    const paidAt = parseOmiseDate(charge.paid_at) ?? at;
    const done: Partial<ProPayment> = {
      status: ProPaymentStatus.SUCCESSFUL,
      paidAt,
      failureCode: null,
      failureMessage: null,
    };
    const refund: Partial<ProPayment> = {
      ...done,
      refundRequired: true,
      failureMessage: REFUND_NOTE,
    };

    await manager.findOne(ProVenue, {
      select: { id: true },
      where: { id: payment.venueId },
      lock: { mode: 'pessimistic_read' },
    });
    const plan = await manager.findOne(ProPlan, {
      where: { id: payment.planId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!plan) {
      this.logger.error(
        `payment ${payment.id} (charge ${charge.id}) is paid but its plan is gone - refund it in the Opn dashboard`,
      );
      const orphan = scheduleOf(charge);
      if (orphan) after.stopSchedules.push(orphan);
      return refund;
    }
    const periodDays = plan.periodDays > 0 ? plan.periodDays : 30;

    if (payment.isRenewal) {
      const sub = payment.subscriptionId
        ? await manager.findOne(ProSubscription, {
            where: { id: payment.subscriptionId },
          })
        : null;
      const chargeSchedule = scheduleOf(charge);
      const reason = !sub
        ? 'subscription missing'
        : sub.status !== String(ProSubscriptionStatus.ACTIVE)
          ? `subscription ${sub.status}`
          : !bool(sub.autoRenew)
            ? 'auto renewal is off'
            : sub.currentPeriodEnd.getTime() + RENEWAL_GRACE_MS <= at.getTime()
              ? 'subscription ended'
              : chargeSchedule && chargeSchedule !== sub.omiseScheduleId
                ? `schedule ${chargeSchedule} is not the subscription's`
                : null;
      if (reason) {
        this.logger.error(
          `renewal charge ${charge.id} is paid for subscription ${sub?.id ?? '-'} but not renewed (${reason}) - refund it in the Opn dashboard`,
        );
        if (chargeSchedule) after.stopSchedules.push(chargeSchedule);
        if (
          sub?.omiseScheduleId &&
          sub.omiseScheduleId !== chargeSchedule &&
          (sub.status !== String(ProSubscriptionStatus.ACTIVE) ||
            sub.currentPeriodEnd.getTime() + RENEWAL_GRACE_MS <= at.getTime())
        ) {
          after.stopSchedules.push(sub.omiseScheduleId);
        }
        if (sub && sub.status === String(ProSubscriptionStatus.ACTIVE)) {
          if (
            sub.currentPeriodEnd.getTime() + RENEWAL_GRACE_MS <=
            at.getTime()
          ) {
            await manager.update(
              ProSubscription,
              { id: sub.id },
              { autoRenew: false },
            );
          }
        }
        return refund;
      }
      const renewed = sub as ProSubscription;
      const start =
        renewed.currentPeriodEnd.getTime() > at.getTime()
          ? renewed.currentPeriodEnd
          : at;
      const end = addDays(start, periodDays);
      await manager.update(
        ProSubscription,
        { id: renewed.id },
        {
          currentPeriodEnd: end,
          lastPaymentId: payment.id,
          renewalFailedAt: null,
        },
      );
      return { ...done, periodStart: start, periodEnd: end };
    }

    const isCard = payment.method === String(ProPaymentMethod.CARD);
    const card = isCard ? cardOf(charge) : null;
    const active = await manager.find(ProSubscription, {
      where: {
        userId: payment.userId,
        venueId: payment.venueId,
        status: ProSubscriptionStatus.ACTIVE,
      },
    });
    const same = active.find(
      (s) =>
        s.planId === payment.planId &&
        s.currentPeriodEnd.getTime() > at.getTime(),
    );
    await this.endSubscriptions(
      manager,
      active.filter((s) => s !== same),
      at,
      after,
    );

    let subscriptionId: string;
    let periodStart: Date;
    let periodEnd: Date;
    let hasSchedule = false;
    if (same) {
      periodStart = same.currentPeriodEnd;
      periodEnd = addDays(periodStart, periodDays);
      hasSchedule = !!same.omiseScheduleId;
      const subChanges: Partial<
        Pick<
          ProSubscription,
          | 'currentPeriodEnd'
          | 'lastPaymentId'
          | 'source'
          | 'renewalFailedAt'
          | 'cardBrand'
          | 'cardLastDigits'
          | 'omiseCardId'
        >
      > = {
        currentPeriodEnd: periodEnd,
        lastPaymentId: payment.id,
        renewalFailedAt: null,
      };
      // Source = how it was last paid; a row renewed by a schedule stays card
      // (and keeps the card of its schedule)
      if (isCard) subChanges.source = ProSubscriptionSource.CARD;
      else if (!hasSchedule) {
        subChanges.source = ProSubscriptionSource.PROMPTPAY;
      }
      if (card && !hasSchedule) Object.assign(subChanges, card);
      await manager.update(ProSubscription, { id: same.id }, subChanges);
      subscriptionId = same.id;
    } else {
      periodStart = at;
      periodEnd = addDays(at, periodDays);
      subscriptionId = randomUUID();
      await manager.insert(ProSubscription, {
        id: subscriptionId,
        userId: payment.userId,
        venueId: payment.venueId,
        planId: payment.planId,
        status: ProSubscriptionStatus.ACTIVE,
        source: isCard
          ? ProSubscriptionSource.CARD
          : ProSubscriptionSource.PROMPTPAY,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        autoRenew: false,
        note: null,
        grantedById: null,
        revokedAt: null,
        revokedById: null,
        omiseScheduleId: null,
        canceledAt: null,
        lastPaymentId: payment.id,
        cardBrand: card?.cardBrand ?? null,
        cardLastDigits: card?.cardLastDigits ?? null,
        omiseCardId: card?.omiseCardId ?? null,
        renewalFailedAt: null,
      });
    }
    if (isCard && !hasSchedule) {
      after.createSchedule = { subscriptionId, paymentId: payment.id };
    }
    return { ...done, subscriptionId, periodStart, periodEnd };
  }

  /**
   * End other active rows of the venue (by primary key, see task 17's
   * grant): still running → revoked now, past their end → expired. Auto
   * renewal off; their schedules are deleted after the commit (the id stays
   * on the row until Opn confirms).
   */
  private async endSubscriptions(
    manager: EntityManager,
    rows: ProSubscription[],
    at: Date,
    after: AfterCommit,
  ): Promise<void> {
    const running = rows.filter(
      (s) => s.currentPeriodEnd.getTime() > at.getTime(),
    );
    const ended = rows.filter(
      (s) => s.currentPeriodEnd.getTime() <= at.getTime(),
    );
    if (running.length > 0) {
      await manager.update(
        ProSubscription,
        { id: In(running.map((s) => s.id)) },
        {
          status: ProSubscriptionStatus.REVOKED,
          revokedAt: at,
          revokedById: null,
          autoRenew: false,
        },
      );
    }
    if (ended.length > 0) {
      await manager.update(
        ProSubscription,
        { id: In(ended.map((s) => s.id)) },
        { status: ProSubscriptionStatus.EXPIRED, autoRenew: false },
      );
    }
    for (const s of rows) {
      if (s.omiseScheduleId) after.deleteSchedules.push(s.omiseScheduleId);
    }
  }

  private async runAfterCommit(after: AfterCommit): Promise<void> {
    const stop = new Set(after.stopSchedules);
    for (const scheduleId of stop) {
      if (!(await this.cancelScheduleQuietly(scheduleId))) {
        this.logger.error(
          `Opn schedule ${scheduleId} must stop (failed or refused renewal) but could not be deleted - delete it in the Opn dashboard before its next charge`,
        );
      }
    }
    for (const scheduleId of new Set(after.deleteSchedules)) {
      if (!stop.has(scheduleId)) await this.cancelScheduleQuietly(scheduleId);
    }
    if (after.createSchedule) {
      await this.createRenewalSchedule(
        after.createSchedule.subscriptionId,
        after.createSchedule.paymentId,
      );
    }
  }

  // ── schedules ───────────────────────────────────────────────────────

  /**
   * Make the Opn schedule that renews a card subscription: every
   * periodDays days from the Thai date of currentPeriodEnd, the same total
   * as the payment (VAT changes later do not touch it), charging the
   * customer's default card; that card (brand / last 4 / Opn id) is stored
   * on the row. Stored with autoRenew on; a failure only logs (the row then
   * shows no auto renewal and can be renewed by hand). A schedule made at
   * Opn but not saved here is deleted again (never left charging unseen).
   */
  async createRenewalSchedule(
    subscriptionId: string,
    paymentId: string,
  ): Promise<string | null> {
    let scheduleId: string | null = null;
    try {
      const sub = await this.subscriptionsRepository.findOne({
        where: { id: subscriptionId },
      });
      if (
        !sub ||
        sub.status !== String(ProSubscriptionStatus.ACTIVE) ||
        sub.omiseScheduleId
      ) {
        return null;
      }
      const [payment, customer, plan, venue] = await Promise.all([
        this.paymentsRepository.findOne({ where: { id: paymentId } }),
        this.customersRepository.findOne({ where: { userId: sub.userId } }),
        this.plansRepository.findOne({ where: { id: sub.planId } }),
        this.venuesRepository.findOne({ where: { id: sub.venueId } }),
      ]);
      if (!payment || !customer || !plan) return null;

      const schedule = await this.postSchedule(
        sub,
        customer.omiseCustomerId,
        payment.totalSatang,
        plan,
        venue,
      );
      scheduleId = schedule.id;
      const madeId = schedule.id;
      const saved = await withUserLock(
        this.dataSource,
        sub.userId,
        async (manager) => {
          const fresh = await manager.findOne(ProSubscription, {
            where: { id: sub.id },
          });
          if (
            !fresh ||
            fresh.status !== String(ProSubscriptionStatus.ACTIVE) ||
            fresh.omiseScheduleId
          ) {
            return false;
          }
          await manager.update(
            ProSubscription,
            { id: sub.id },
            {
              omiseScheduleId: madeId,
              autoRenew: true,
              canceledAt: null,
              renewalFailedAt: null,
              cardBrand: customer.cardBrand,
              cardLastDigits: customer.cardLastDigits,
              omiseCardId: schedule.cardId,
            },
          );
          await manager.update(
            ProPayment,
            { id: payment.id },
            { omiseScheduleId: madeId },
          );
          return true;
        },
      );
      if (!saved) {
        await this.dropOrphanSchedule(madeId, paymentId);
        return null;
      }
      return madeId;
    } catch (err) {
      this.logger.warn(
        `could not set up auto renewal of subscription ${subscriptionId}: ${describe(err)}`,
      );
      if (scheduleId) await this.dropOrphanSchedule(scheduleId, paymentId);
      return null;
    }
  }

  /**
   * A schedule exists at Opn but no subscription points to it: delete it.
   * If Opn cannot delete it now, log an ERROR (delete it in the dashboard)
   * and keep its id on the payment, so a charge it makes is recognised,
   * not renewed, flagged refundRequired and the schedule deleted then.
   */
  private async dropOrphanSchedule(
    scheduleId: string,
    paymentId: string,
  ): Promise<void> {
    try {
      await this.deleteSchedule(scheduleId);
      return;
    } catch (err) {
      this.logger.error(
        `Opn schedule ${scheduleId} (payment ${paymentId}) is not used but could not be deleted (${describe(err)}) - delete it in the Opn dashboard`,
      );
    }
    try {
      await this.paymentsRepository.update(
        { id: paymentId },
        { omiseScheduleId: scheduleId },
      );
    } catch (err) {
      this.logger.error(
        `could not record Opn schedule ${scheduleId} on payment ${paymentId}: ${describe(err)}`,
      );
    }
  }

  private async postSchedule(
    sub: ProSubscription,
    customerId: string,
    amount: number,
    plan: ProPlan,
    venue: ProVenue | null,
  ): Promise<{ id: string; cardId: string | null }> {
    const startDate = bangkokDate(sub.currentPeriodEnd);
    const schedule = await this.omise.createSchedule({
      every: plan.periodDays > 0 ? plan.periodDays : 30,
      period: 'day',
      start_date: startDate,
      end_date: addYearsToDate(startDate, SCHEDULE_YEARS),
      charge: {
        customer: customerId,
        amount,
        currency: 'thb',
        description: clip(
          `LUMO ${venue?.name ?? ''} ${plan.name} ต่ออายุอัตโนมัติ`,
          255,
        ) as string,
        metadata: {
          subscriptionId: sub.id,
          planId: sub.planId,
          userId: sub.userId,
        },
      },
    });
    const cardId = schedule.charge?.card;
    return {
      id: schedule.id,
      cardId: typeof cardId === 'string' ? clip(cardId, 64) : null,
    };
  }

  /**
   * DELETE /schedules/:id at Opn (already gone = fine), then clear it from
   * the subscription rows that still point to it (only while they still
   * point to it: a row given a new schedule meanwhile keeps it). Failure
   * only logs; the id stays on the row so a later charge of it is still
   * recognised.
   */
  async cancelScheduleQuietly(scheduleId: string): Promise<boolean> {
    try {
      await this.deleteSchedule(scheduleId);
    } catch (err) {
      this.logger.warn(
        `could not delete Opn schedule ${scheduleId}: ${describe(err)}`,
      );
      return false;
    }
    const rows = await this.subscriptionsRepository.find({
      select: { id: true },
      where: { omiseScheduleId: scheduleId },
    });
    if (rows.length > 0) {
      await this.subscriptionsRepository.update(
        { id: In(rows.map((r) => r.id)), omiseScheduleId: scheduleId },
        { omiseScheduleId: null, autoRenew: false },
      );
    }
    return true;
  }

  /** DELETE /schedules/:id; a schedule that no longer exists counts as deleted. */
  async deleteSchedule(scheduleId: string): Promise<void> {
    try {
      await this.omise.deleteSchedule(scheduleId);
    } catch (err) {
      if (err instanceof OmiseError && err.notFound) return;
      throw err;
    }
  }

  /**
   * After the default card changed: the schedules of the user's active
   * card rows keep the card they were made with (Opn stores it), so each is
   * made again (old deleted first, then the new one from the same date).
   * Returns the ids of rows whose auto renewal could not be made again.
   */
  async remakeSchedulesForUser(userId: string): Promise<string[]> {
    const rows = await this.subscriptionsRepository.find({
      where: { userId, status: ProSubscriptionStatus.ACTIVE },
    });
    const customer = await this.customersRepository.findOne({
      where: { userId },
    });
    const failed: string[] = [];
    if (!customer) return failed;
    const now = Date.now();
    for (const sub of rows) {
      if (!sub.omiseScheduleId || sub.currentPeriodEnd.getTime() <= now) {
        continue;
      }
      const oldId = sub.omiseScheduleId;
      try {
        await this.deleteSchedule(oldId);
      } catch (err) {
        this.logger.warn(
          `could not delete Opn schedule ${oldId} to change the card: ${describe(err)}`,
        );
        failed.push(sub.id);
        continue;
      }
      await this.subscriptionsRepository.update(
        { id: sub.id, omiseScheduleId: oldId },
        { omiseScheduleId: null, autoRenew: false },
      );
      const created = sub.lastPaymentId
        ? await this.createRenewalSchedule(sub.id, sub.lastPaymentId)
        : null;
      if (!created) failed.push(sub.id);
    }
    return failed;
  }

  // ── customers ───────────────────────────────────────────────────────

  /**
   * Inside checkout's user lock: the user's Opn customer with the card of
   * `token` attached and made the default (created at the first card
   * payment). The Opn calls are memoized in `memo`, so a retry of the
   * transaction after a deadlock does not use the token twice. Errors:
   * token refused → 400 CARD_DECLINED, Opn down → 503 OMISE_UNAVAILABLE.
   */
  async ensureCustomerLocked(
    manager: EntityManager,
    user: { id: string; email?: string | null },
    token: string,
    memo: CustomerMemo,
  ): Promise<CustomerCard> {
    const row = await manager.findOne(ProCustomer, {
      where: { userId: user.id },
    });
    if (!memo.customer) {
      memo.customer = await this.attachCard(row, user, token);
    }
    const customer = memo.customer;
    const card = defaultCardOf(customer);
    if (!card) throw new ProException('CARD_DECLINED');
    const values = {
      omiseCustomerId: customer.id,
      cardBrand: clip(card.brand, 30),
      cardLastDigits: clip(card.last_digits, 4),
    };
    if (row) {
      await manager.update(ProCustomer, { userId: user.id }, values);
    } else {
      await manager.insert(ProCustomer, { userId: user.id, ...values });
    }
    return {
      customerId: customer.id,
      cardId: card.id,
      cardBrand: values.cardBrand,
      cardLastDigits: values.cardLastDigits,
    };
  }

  /**
   * Attach the card of `token` to the customer (a new customer when there
   * is none, or Opn no longer has it) and make it the default card.
   */
  async attachCard(
    row: Pick<ProCustomer, 'omiseCustomerId'> | null,
    user: { id: string; email?: string | null },
    token: string,
  ): Promise<OmiseCustomer> {
    try {
      if (row) {
        try {
          const updated = await this.omise.updateCustomer(row.omiseCustomerId, {
            card: token,
          });
          const added = newestCard(updated.cards?.data ?? []);
          if (!added) throw new ProException('CARD_DECLINED');
          if (updated.default_card === added.id) return updated;
          return await this.omise.updateCustomer(row.omiseCustomerId, {
            default_card: added.id,
          });
        } catch (err) {
          if (!(err instanceof OmiseError && err.customerNotFound)) throw err;
        }
      }
      return await this.omise.createCustomer({
        email: user.email ?? undefined,
        description: `LUMO user ${user.id}`,
        card: token,
        metadata: { userId: user.id },
      });
    } catch (err) {
      if (err instanceof OmiseError) {
        throw new ProException(
          err.unavailable ? 'OMISE_UNAVAILABLE' : 'CARD_DECLINED',
        );
      }
      throw err;
    }
  }
}

/** Error text for logs: codes only, never bodies, tokens or keys. */
export function describe(err: unknown): string {
  if (err instanceof OmiseError) return `${err.status} ${err.code}`;
  if (err instanceof ProException) return err.errorCode;
  if (err instanceof Error) return err.name;
  return 'error';
}
