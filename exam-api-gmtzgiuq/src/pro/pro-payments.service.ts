import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { escapeLike } from '../unlock-codes/unlock-code-format';
import { ProCustomer } from './pro-customer.entity';
import { ProPage, PRO_PAGE_ID } from './pro-page.entity';
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
import { ProException } from './pro-errors';
import { isUnresolvedClientIp } from '../common/trust-proxy';
import { withUserLock } from './pro-user-lock';
import { OmiseCharge, OmiseClient, OmiseError } from './omise.client';
import {
  CustomerCard,
  CustomerMemo,
  NewPayment,
  ProBillingService,
  defaultCardOf,
  describe,
  qrImageOf,
} from './pro-billing.service';
import {
  MIN_CHARGE_SATANG,
  OMISE_DOWN_MESSAGE,
  PaymentAmounts,
  QR_REUSE_MIN_MS,
  SYNC_THROTTLE_MS,
  clip,
  computeAmounts,
  floorToSecond,
  parseOmiseDate,
  thaiFailureMessage,
} from './pro-payment-format';
import {
  MySubscriptionView,
  ProSubscriptionsService,
} from './pro-subscriptions.service';
import {
  CheckoutDto,
  PAYMENT_METHODS,
  PAYMENT_STATUS_FILTERS,
} from './dto/pro-payments.dto';

/** GET /pro/checkout/quote */
export interface CheckoutQuote extends PaymentAmounts {
  plan: {
    id: string;
    code: string;
    name: string;
    priceSatang: number;
    periodDays: number;
    venue: { id: string; key: string; name: string };
  };
  vatEnabled: boolean;
  // The user's subscription of the venue that gives rights now
  current: {
    planId: string;
    currentPeriodEnd: Date;
    autoRenew: boolean;
    source: string;
  } | null;
  // Buying this plan replaces another plan of the venue (starts now)
  changesPlan: boolean;
}

/** POST /pro/checkout */
export interface CheckoutResult {
  paymentId: string;
  status: string;
  // card + 3-D Secure: send the browser here
  authorizeUri?: string;
  // PromptPay
  qrImageUrl?: string;
  expiresAt?: Date;
  failureMessage?: string;
}

/** GET /pro/payments/:id */
export interface PaymentView {
  id: string;
  status: string;
  method: string;
  isRenewal: boolean;
  totalSatang: number;
  subtotalSatang: number;
  vatSatang: number;
  discountSatang: number;
  currency: string;
  qrImageUrl: string | null;
  expiresAt: Date | null;
  failureMessage: string | null;
  // money taken without rights: will be refunded by the admin
  refundRequired: boolean;
  paidAt: Date | null;
  createdAt: Date;
  plan: { id: string; code: string; name: string } | null;
  venue: { id: string; key: string; name: string } | null;
  subscription: {
    id: string;
    currentPeriodEnd: Date;
    autoRenew: boolean;
  } | null;
}

/** An item of GET /pro/payments/me */
export interface MyPaymentItem {
  id: string;
  status: string;
  method: string;
  isRenewal: boolean;
  totalSatang: number;
  subtotalSatang: number;
  vatSatang: number;
  failureMessage: string | null;
  refundRequired: boolean;
  omiseChargeId: string | null;
  subscriptionId: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  plan: { id: string; code: string; name: string } | null;
  venue: { id: string; key: string; name: string } | null;
}

/** An item of GET /pro/admin/payments (safe user fields only). */
export interface AdminPaymentItem {
  id: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  venue: { id: string; key: string; name: string } | null;
  plan: { id: string; code: string; name: string } | null;
  method: string;
  status: string;
  isRenewal: boolean;
  subtotalSatang: number;
  vatSatang: number;
  totalSatang: number;
  omiseChargeId: string | null;
  subscriptionId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  // money taken without rights: refund it in the Opn dashboard
  refundRequired: boolean;
  paidAt: Date | null;
  createdAt: Date;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminPaymentQuery {
  page?: number;
  limit?: number;
  status?: string;
  method?: string;
  venueId?: string;
  search?: string;
}

/** Raw row of the payment list queries. */
interface PaymentRow {
  id: string;
  status: string;
  method: string;
  isRenewal: number | boolean | string;
  subtotalSatang: number | string;
  vatSatang: number | string;
  totalSatang: number | string;
  omiseChargeId: string | null;
  subscriptionId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  refundRequired: number | boolean | string;
  expiresAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  userId: string;
  userEmail?: string | null;
  userFirstName?: string | null;
  userLastName?: string | null;
  venueId: string;
  venueKey: string | null;
  venueName: string | null;
  planId: string;
  planCode: string | null;
  planName: string | null;
}

const bool = (value: unknown) => value === true || Number(value) === 1;

/** A pending payment without a charge this young is still being made. */
export const INFLIGHT_MS = 30_000;
/** failureCode of a payment whose charge request could not reach Opn. */
export const OMISE_DOWN_CODE = 'omise_unavailable';
/**
 * Junk webhook requests (malformed id, or an event Opn does not have) per
 * client IP per minute; past it the IP gets 503 until the minute ends.
 * Real events never count, so Opn itself is never limited.
 */
export const WEBHOOK_MAX_PER_MIN = 30;
/** A handled event id is not asked from Opn again for this long. */
export const WEBHOOK_EVENT_CACHE_MS = 10 * 60 * 1000;
const WEBHOOK_MAP_MAX = 5000;
const INFLIGHT_WAIT_MS = 500;
const INFLIGHT_WAIT_TRIES = 16;

function clampPage(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/**
 * Pro payments for users and admins (task 18): quote, checkout (card with
 * auto renewal / PromptPay), the payment status page, history, cancel the
 * auto renewal, change the card, and the admin list. Charges are applied
 * only by ProBillingService.syncCharge (the charge read from Opn).
 */
@Injectable()
export class ProPaymentsService implements OnModuleInit {
  private readonly logger = new Logger(ProPaymentsService.name);
  // Webhook: junk requests per client IP in the current minute, and event
  // ids already handled (not asked from Opn again for 10 min)
  private readonly webhookHits = new Map<
    string,
    { windowStart: number; count: number; rejected: number }
  >();
  private readonly handledEvents = new Map<string, number>();
  private warnedUnresolvedIp = false;

  constructor(
    @InjectRepository(ProPayment)
    private paymentsRepository: Repository<ProPayment>,
    @InjectRepository(ProPlan)
    private plansRepository: Repository<ProPlan>,
    @InjectRepository(ProPage)
    private pageRepository: Repository<ProPage>,
    @InjectRepository(ProSubscription)
    private subscriptionsRepository: Repository<ProSubscription>,
    @InjectRepository(ProCustomer)
    private customersRepository: Repository<ProCustomer>,
    private dataSource: DataSource,
    private omise: OmiseClient,
    private billing: ProBillingService,
    private subscriptionsService: ProSubscriptionsService,
    private configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.omise.isConfigured() && !this.frontendBase()) {
      this.logger.error(
        'FRONTEND_URL is not set: card checkout is refused (3-D Secure has no page to return to). Set FRONTEND_URL in the API .env',
      );
    }
  }

  // ── quote / checkout ────────────────────────────────────────────────

  /**
   * GET /pro/checkout/quote: the amounts the checkout will charge (plan
   * price + VAT when on, worked out here) and the user's current plan of
   * the venue. Plan missing → 404; hidden / not for sale / free / venue
   * off → 400 PLAN_NOT_PURCHASABLE.
   */
  async quote(
    userId: string,
    planId: string,
    now: Date = new Date(),
  ): Promise<CheckoutQuote> {
    const plan = await this.plansRepository.findOne({
      where: { id: planId },
      relations: { venue: true },
    });
    assertPurchasable(plan, plan?.venue ?? null);
    const vatEnabled = await this.isVatEnabled();
    const amounts = computeAmounts(plan.priceSatang, vatEnabled);
    if (amounts.totalSatang < MIN_CHARGE_SATANG) {
      throw new ProException('AMOUNT_TOO_LOW');
    }
    const current = await this.subscriptionsRepository.findOne({
      where: {
        userId,
        venueId: plan.venueId,
        status: ProSubscriptionStatus.ACTIVE,
        currentPeriodEnd: MoreThan(now),
      },
      order: { currentPeriodEnd: 'DESC' },
    });
    const venue = plan.venue as ProVenue;
    return {
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        priceSatang: plan.priceSatang,
        periodDays: plan.periodDays,
        venue: { id: venue.id, key: venue.key, name: venue.name },
      },
      ...amounts,
      vatEnabled,
      current: current
        ? {
            planId: current.planId,
            currentPeriodEnd: current.currentPeriodEnd,
            autoRenew: bool(current.autoRenew),
            source: current.source,
          }
        : null,
      changesPlan: !!current && current.planId !== plan.id,
    };
  }

  /**
   * POST /pro/checkout.
   * 1. Under the user's lock (users → venue S → plan S): the plan must
   *    still be for sale, amounts from the locked plan + VAT (never from
   *    the client), the same plan renewing by card already → 409
   *    ALREADY_AUTO_RENEW, a pending PromptPay QR of the same plan and
   *    amount still valid ≥ 1 min → returned again (no new QR); card → the
   *    user's Opn customer gets the token's card (default card); a pending
   *    payment row is inserted and committed before Opn is asked to charge.
   * 2. POST /charges (metadata.paymentId) outside the transaction: Opn
   *    refuses (4xx) → payment failed; Opn down → payment failed at once
   *    (failureCode omise_unavailable, Thai message) and 503; if Opn did
   *    make the charge after all, its webhook still opens the rights. A card
   *    retry within INFLIGHT_MS of such a failure → 409 PAYMENT_IN_PROGRESS.
   * 3. A charge that is already final is applied through syncCharge.
   * Card pending = 3-D Secure → authorizeUri; PromptPay → QR + expiresAt.
   */
  async checkout(
    user: Pick<User, 'id' | 'email'>,
    input: CheckoutDto,
    now: Date = new Date(),
  ): Promise<CheckoutResult> {
    if (!this.omise.isConfigured()) {
      throw new ProException('OMISE_UNAVAILABLE');
    }
    const method =
      input.method === 'card'
        ? ProPaymentMethod.CARD
        : ProPaymentMethod.PROMPTPAY;
    // 3-D Secure sends the browser back to FRONTEND_URL: without it a card
    // payment could not come back (PromptPay does not use it)
    if (method === ProPaymentMethod.CARD && !this.frontendBase()) {
      throw new ProException('OMISE_UNAVAILABLE');
    }
    // Quick checks before taking the lock
    const quick = await this.plansRepository.findOne({
      where: { id: input.planId },
      relations: { venue: true },
    });
    assertPurchasable(quick, quick?.venue ?? null);

    const paymentId = randomUUID();
    const memo: CustomerMemo = {};
    const prepared = await withUserLock(
      this.dataSource,
      user.id,
      async (manager) => {
        const venue = await manager.findOne(ProVenue, {
          where: { id: quick.venueId },
          lock: { mode: 'pessimistic_read' },
        });
        const plan = await manager.findOne(ProPlan, {
          where: { id: input.planId },
          lock: { mode: 'pessimistic_read' },
        });
        assertPurchasable(plan, venue);
        const page = await manager.findOne(ProPage, {
          where: { id: PRO_PAGE_ID },
        });
        const amounts = computeAmounts(
          plan.priceSatang,
          bool(page?.vatEnabled),
        );
        if (amounts.totalSatang < MIN_CHARGE_SATANG) {
          throw new ProException('AMOUNT_TOO_LOW');
        }

        const active = await manager.find(ProSubscription, {
          where: {
            userId: user.id,
            venueId: plan.venueId,
            status: ProSubscriptionStatus.ACTIVE,
          },
        });
        const renewing = active.find(
          (s) =>
            s.planId === plan.id &&
            s.currentPeriodEnd.getTime() > now.getTime() &&
            bool(s.autoRenew) &&
            !!s.omiseScheduleId,
        );
        if (renewing) throw new ProException('ALREADY_AUTO_RENEW');

        const recent = await manager.find(ProPayment, {
          where: {
            userId: user.id,
            planId: plan.id,
            method,
            isRenewal: false,
          },
          order: { createdAt: 'DESC' },
          take: 5,
        });
        const pendings = recent.filter(
          (p) => p.status === String(ProPaymentStatus.PENDING),
        );
        // Another checkout of this plan is asking Opn right now (row
        // committed, no charge yet): no second charge / QR. A card payment
        // whose charge request timed out counts too (Opn may have charged
        // it; a webhook will tell) so a retry cannot charge twice.
        const inflight = recent.find(
          (p) =>
            !p.omiseChargeId &&
            now.getTime() - new Date(p.createdAt).getTime() < INFLIGHT_MS &&
            ((p.status === String(ProPaymentStatus.PENDING) &&
              !p.failureCode) ||
              (method === ProPaymentMethod.CARD &&
                p.status === String(ProPaymentStatus.FAILED) &&
                p.failureCode === OMISE_DOWN_CODE)),
        );
        if (inflight) {
          if (method === ProPaymentMethod.CARD) {
            throw new ProException('PAYMENT_IN_PROGRESS');
          }
          return { inflight, reuse: null, plan, venue, amounts, card: null };
        }
        if (method === ProPaymentMethod.PROMPTPAY) {
          const reuse = pendings.find(
            (p) =>
              !!p.omiseChargeId &&
              !!p.qrImageUrl &&
              !!p.expiresAt &&
              p.expiresAt.getTime() - now.getTime() >= QR_REUSE_MIN_MS &&
              p.totalSatang === amounts.totalSatang,
          );
          if (reuse) {
            return { inflight: null, reuse, plan, venue, amounts, card: null };
          }
        }

        let card: CustomerCard | null = null;
        if (method === ProPaymentMethod.CARD) {
          card = await this.billing.ensureCustomerLocked(
            manager,
            user,
            input.cardToken ?? '',
            memo,
          );
        }
        const row: NewPayment = {
          id: paymentId,
          userId: user.id,
          venueId: plan.venueId,
          planId: plan.id,
          subscriptionId: null,
          method,
          status: ProPaymentStatus.PENDING,
          isRenewal: false,
          subtotalSatang: amounts.subtotalSatang,
          vatSatang: amounts.vatSatang,
          discountSatang: 0,
          totalSatang: amounts.totalSatang,
          currency: 'THB',
          omiseChargeId: null,
          omiseScheduleId: null,
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
        await manager.insert(ProPayment, row);
        return { inflight: null, reuse: null, plan, venue, amounts, card };
      },
    );

    if (prepared.inflight) return this.waitForQr(prepared.inflight.id);
    if (prepared.reuse) {
      const p = prepared.reuse;
      return {
        paymentId: p.id,
        status: p.status,
        qrImageUrl: p.qrImageUrl ?? undefined,
        expiresAt: p.expiresAt ?? undefined,
      };
    }

    const { plan, venue, amounts, card } = prepared;
    let charge: OmiseCharge;
    try {
      charge = await this.omise.createCharge({
        amount: amounts.totalSatang,
        currency: 'thb',
        description: clip(
          `LUMO ${venue?.name ?? ''} ${plan.name}`,
          255,
        ) as string,
        return_uri: this.returnUri(paymentId) ?? undefined,
        metadata: { paymentId, userId: user.id, planId: plan.id },
        ...(card
          ? { customer: card.customerId, card: card.cardId }
          : { source: { type: 'promptpay' as const } }),
      });
    } catch (err) {
      if (err instanceof OmiseError && !err.unavailable) {
        // Opn refused the request: no charge was made
        const failureMessage = thaiFailureMessage(err.code, method);
        this.logger.warn(
          `checkout ${paymentId}: Opn refused the charge (${describe(err)})`,
        );
        await this.paymentsRepository.update(
          { id: paymentId, status: ProPaymentStatus.PENDING },
          {
            status: ProPaymentStatus.FAILED,
            failureCode: clip(err.code, 64),
            failureMessage,
          },
        );
        return { paymentId, status: ProPaymentStatus.FAILED, failureMessage };
      }
      this.logger.warn(`checkout ${paymentId}: ${describe(err)}`);
      // Failed now (the page shows it at once). If Opn did make the charge
      // after all, its webhook still opens the rights (a failed payment
      // without a charge id may still become successful, see applyLocked).
      await this.paymentsRepository.update(
        { id: paymentId, status: ProPaymentStatus.PENDING },
        {
          status: ProPaymentStatus.FAILED,
          failureCode: OMISE_DOWN_CODE,
          failureMessage: OMISE_DOWN_MESSAGE,
        },
      );
      throw new ProException('OMISE_UNAVAILABLE');
    }

    // Link the charge (a webhook may have done it already)
    const link: Partial<ProPayment> = { omiseChargeId: charge.id };
    if (method === ProPaymentMethod.PROMPTPAY) {
      link.qrImageUrl = clip(qrImageOf(charge), 500);
      link.expiresAt = parseOmiseDate(charge.expires_at);
    }
    await this.paymentsRepository
      .createQueryBuilder()
      .update(ProPayment)
      .set(link)
      .where('id = :id AND omiseChargeId IS NULL', { id: paymentId })
      .execute();

    if (charge.status !== 'pending') {
      try {
        await this.billing.syncCharge(charge.id, paymentId);
      } catch (err) {
        if (!(err instanceof OmiseError)) throw err;
        // Opn's answer to our own POST is from Opn too
        await this.billing.applyCharge(charge, paymentId);
      }
    }

    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
    });
    const status = payment?.status ?? ProPaymentStatus.PENDING;
    const result: CheckoutResult = { paymentId, status };
    if (status === String(ProPaymentStatus.PENDING)) {
      if (method === ProPaymentMethod.CARD && charge.authorize_uri) {
        result.authorizeUri = charge.authorize_uri;
      }
      if (method === ProPaymentMethod.PROMPTPAY) {
        result.qrImageUrl = payment?.qrImageUrl ?? undefined;
        result.expiresAt = payment?.expiresAt ?? undefined;
      }
    } else if (payment?.failureMessage) {
      result.failureMessage = payment.failureMessage;
    }
    return result;
  }

  /**
   * A PromptPay checkout of the same plan is creating its QR right now:
   * wait a little for it and answer with that payment; still no QR → 409
   * PAYMENT_IN_PROGRESS (try again).
   */
  private async waitForQr(paymentId: string): Promise<CheckoutResult> {
    for (let i = 0; i < INFLIGHT_WAIT_TRIES; i++) {
      await new Promise((resolve) => setTimeout(resolve, INFLIGHT_WAIT_MS));
      const p = await this.paymentsRepository.findOne({
        where: { id: paymentId },
      });
      if (!p) break;
      if (p.status !== String(ProPaymentStatus.PENDING)) {
        return {
          paymentId: p.id,
          status: p.status,
          failureMessage: p.failureMessage ?? undefined,
        };
      }
      if (p.qrImageUrl) {
        return {
          paymentId: p.id,
          status: p.status,
          qrImageUrl: p.qrImageUrl,
          expiresAt: p.expiresAt ?? undefined,
        };
      }
      if (p.failureCode) break;
    }
    throw new ProException('PAYMENT_IN_PROGRESS');
  }

  // ── the user's payments ─────────────────────────────────────────────

  /**
   * GET /pro/payments/:id (owner only, else 404). While pending, asks Opn
   * about its charge at most once per 5 s per payment (the throttle is a
   * conditional UPDATE, so it holds across processes) and applies it.
   */
  async getMine(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<PaymentView> {
    if (!isUUID(id)) throw new ProException('PAYMENT_NOT_FOUND');
    let payment = await this.paymentsRepository.findOne({
      where: { id, userId },
    });
    if (!payment) throw new ProException('PAYMENT_NOT_FOUND');

    if (
      payment.status === String(ProPaymentStatus.PENDING) &&
      payment.omiseChargeId &&
      (await this.claimSync(payment.id, now))
    ) {
      try {
        await this.billing.syncCharge(
          payment.omiseChargeId,
          bool(payment.isRenewal) ? undefined : payment.id,
        );
      } catch (err) {
        // Opn down / user busy: show the stored state, the next poll retries
        if (!(err instanceof OmiseError || err instanceof ProException)) {
          throw err;
        }
        this.logger.warn(`sync of payment ${payment.id}: ${describe(err)}`);
      }
      payment =
        (await this.paymentsRepository.findOne({ where: { id, userId } })) ??
        payment;
    }
    return this.toView(payment);
  }

  /** GET /pro/payments/me: newest first, limit ≤ 50. */
  async listMine(
    userId: string,
    pageInput?: number,
    limitInput?: number,
  ): Promise<Paged<MyPaymentItem>> {
    const page = clampPage(pageInput);
    const limit = clampLimit(limitInput, 20, 50);
    const qb = this.listQuery().where('pay.userId = :userId', { userId });
    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('pay.createdAt', 'DESC')
      .addOrderBy('pay.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<PaymentRow>();
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        method: row.method,
        isRenewal: bool(row.isRenewal),
        totalSatang: Number(row.totalSatang),
        subtotalSatang: Number(row.subtotalSatang),
        vatSatang: Number(row.vatSatang),
        failureMessage: row.failureMessage ?? null,
        refundRequired: bool(row.refundRequired),
        omiseChargeId: row.omiseChargeId ?? null,
        subscriptionId: row.subscriptionId ?? null,
        expiresAt: row.expiresAt ?? null,
        paidAt: row.paidAt ?? null,
        createdAt: row.createdAt,
        plan: planOf(row),
        venue: venueOf(row),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── renewal / card ──────────────────────────────────────────────────

  /**
   * POST /pro/subscriptions/:id/cancel-renewal (owner only, else 404):
   * DELETE the Opn schedule first (Opn down → 503, nothing changes), then
   * autoRenew off + canceledAt; the rights stay until currentPeriodEnd.
   * Not renewing by card (no schedule / not active) → 409 NOT_RENEWABLE.
   */
  async cancelRenewal(
    userId: string,
    subscriptionId: string,
    now: Date = new Date(),
  ): Promise<MySubscriptionView> {
    const sub = await this.findOwnSubscription(userId, subscriptionId);
    const scheduleId = sub.omiseScheduleId;
    if (
      sub.status !== String(ProSubscriptionStatus.ACTIVE) ||
      sub.currentPeriodEnd.getTime() <= now.getTime() ||
      !scheduleId ||
      !bool(sub.autoRenew)
    ) {
      throw new ProException('NOT_RENEWABLE');
    }
    try {
      await this.billing.deleteSchedule(scheduleId);
    } catch (err) {
      this.logger.warn(
        `cancel renewal of ${sub.id}: Opn schedule not deleted (${describe(err)})`,
      );
      throw new ProException('OMISE_UNAVAILABLE');
    }
    await withUserLock(this.dataSource, userId, async (manager) => {
      await manager.update(
        ProSubscription,
        { id: sub.id, omiseScheduleId: scheduleId },
        {
          autoRenew: false,
          omiseScheduleId: null,
          canceledAt: floorToSecond(now),
        },
      );
    });
    return this.subscriptionsService.findMineOne(userId, sub.id, now);
  }

  /**
   * POST /pro/subscriptions/:id/change-card (owner only, else 404; active
   * card subscription only, else 409 NOT_CARD_SUBSCRIPTION): attach the
   * token's card to the user's Opn customer as the default card, then make
   * the renewal schedules again so they charge the new card (Opn keeps the
   * card a schedule was made with).
   */
  async changeCard(
    user: Pick<User, 'id' | 'email'>,
    subscriptionId: string,
    cardToken: string,
    now: Date = new Date(),
  ): Promise<{
    cardBrand: string | null;
    cardLastDigits: string | null;
    autoRenewFailed: string[];
  }> {
    const sub = await this.findOwnSubscription(user.id, subscriptionId);
    const customer = await this.customersRepository.findOne({
      where: { userId: user.id },
    });
    if (
      sub.status !== String(ProSubscriptionStatus.ACTIVE) ||
      sub.currentPeriodEnd.getTime() <= now.getTime() ||
      sub.source !== String(ProSubscriptionSource.CARD) ||
      !customer
    ) {
      throw new ProException('NOT_CARD_SUBSCRIPTION');
    }
    const updated = await this.billing.attachCard(customer, user, cardToken);
    const card = defaultCardOf(updated);
    const values = {
      omiseCustomerId: updated.id,
      cardBrand: clip(card?.brand, 30),
      cardLastDigits: clip(card?.last_digits, 4),
    };
    await this.customersRepository.update({ userId: user.id }, values);
    const autoRenewFailed = await this.billing.remakeSchedulesForUser(user.id);
    return {
      cardBrand: values.cardBrand,
      cardLastDigits: values.cardLastDigits,
      autoRenewFailed,
    };
  }

  // ── webhook ─────────────────────────────────────────────────────────

  /**
   * POST /pro/payments/omise/webhook. Only the event id of the body is
   * used: the event is read from Opn with the secret key, and for charge.*
   * events the charge is read again (syncCharge). Unknown / fake event ids
   * and charges that are not ours are answered 200 and ignored. Opn could
   * not be reached, or the user is locked by another writer → 503 so Opn
   * sends it again. The body is never logged.
   *
   * Abuse: an event id handled in the last 10 min is answered from memory.
   * Only junk (malformed ids, ids Opn does not have) counts toward the
   * per-client-IP limit; an IP past it gets 503 (logged as ERROR) for
   * anything not handled already. Real events never count, so Opn's own
   * requests are never limited. An IP that cannot tell clients apart
   * (missing / loopback: no X-Forwarded-For from a local proxy) is not
   * limited at all.
   */
  async handleWebhook(
    eventId: unknown,
    ip?: string,
    now: number = Date.now(),
  ): Promise<{ ok: true }> {
    const key = this.limitKey(ip);
    const wellFormed =
      typeof eventId === 'string' && /^evnt_(test_)?[0-9a-z]+$/.test(eventId);
    if (wellFormed) {
      const seen = this.handledEvents.get(eventId);
      if (seen !== undefined && seen > now) return { ok: true };
    }
    if (key) this.assertUnderLimit(key, now);
    if (!wellFormed) {
      if (key) this.countJunk(key, now);
      return { ok: true };
    }
    const { notFound } = await this.processWebhookEvent(eventId);
    if (notFound && key) this.countJunk(key, now);
    this.rememberEvent(eventId, now);
    return { ok: true };
  }

  /** The limit key of a client IP, or null when it cannot be limited. */
  private limitKey(ip: string | undefined): string | null {
    if (!isUnresolvedClientIp(ip)) return (ip as string).trim().toLowerCase();
    if (!this.warnedUnresolvedIp) {
      this.warnedUnresolvedIp = true;
      this.logger.warn(
        'webhook: the client IP is unknown or a loopback address (no X-Forwarded-For from a local proxy?) - junk requests are not limited',
      );
    }
    return null;
  }

  private junkWindow(key: string, now: number) {
    let hit = this.webhookHits.get(key);
    if (!hit || now - hit.windowStart >= 60_000) {
      if (this.webhookHits.size >= WEBHOOK_MAP_MAX) this.webhookHits.clear();
      hit = { windowStart: now, count: 0, rejected: 0 };
      this.webhookHits.set(key, hit);
    }
    return hit;
  }

  /** Past WEBHOOK_MAX_PER_MIN junk requests this minute → 503 (ERROR log). */
  private assertUnderLimit(key: string, now: number): void {
    const hit = this.junkWindow(key, now);
    if (hit.count < WEBHOOK_MAX_PER_MIN) return;
    hit.rejected++;
    if (hit.rejected === 1 || hit.rejected % 100 === 0) {
      this.logger.error(
        `webhook: ${key} sent ${hit.count} junk requests this minute - answering 503 (${hit.rejected} rejected)`,
      );
    }
    throw new ProException('WEBHOOK_RATE_LIMITED');
  }

  private countJunk(key: string, now: number): void {
    this.junkWindow(key, now).count++;
  }

  private rememberEvent(eventId: string, now: number): void {
    if (this.handledEvents.size >= WEBHOOK_MAP_MAX) {
      for (const [id, until] of this.handledEvents) {
        if (until <= now) this.handledEvents.delete(id);
      }
      if (this.handledEvents.size >= WEBHOOK_MAP_MAX) {
        this.handledEvents.clear();
      }
    }
    this.handledEvents.set(eventId, now + WEBHOOK_EVENT_CACHE_MS);
  }

  /**
   * The event read from Opn, then its charge (see handleWebhook).
   * notFound = Opn has no such event (junk).
   */
  private async processWebhookEvent(
    eventId: string,
  ): Promise<{ notFound: boolean }> {
    try {
      const event = await this.omise.getEvent(eventId);
      const chargeId = event?.data?.id;
      if (
        typeof event?.key !== 'string' ||
        !event.key.startsWith('charge.') ||
        event.data?.object !== 'charge' ||
        typeof chargeId !== 'string'
      ) {
        return { notFound: false };
      }
      const outcome = await this.billing.syncCharge(chargeId);
      this.logger.log(
        `webhook ${eventId} ${event.key} ${chargeId}: ${outcome.handled ? outcome.status : `ignored (${outcome.reason})`}`,
      );
      return { notFound: false };
    } catch (err) {
      if (err instanceof OmiseError) {
        if (err.unavailable) throw new ProException('OMISE_UNAVAILABLE');
        // Not found / not ours: nothing to do
        this.logger.warn(`webhook ${eventId}: ${describe(err)} - ignored`);
        return { notFound: err.notFound };
      }
      if (err instanceof ProException && err.errorCode === 'USER_BUSY') {
        throw new ProException('OMISE_UNAVAILABLE');
      }
      throw err;
    }
  }

  // ── admin ───────────────────────────────────────────────────────────

  /**
   * GET /pro/admin/payments: newest first, limit ≤ 100; filters status,
   * method, venueId; search = email / name of the user or the charge id.
   */
  async listForAdmin(
    query: AdminPaymentQuery,
  ): Promise<Paged<AdminPaymentItem>> {
    const status = query.status?.trim() || undefined;
    const method = query.method?.trim() || undefined;
    if (
      (status &&
        !(PAYMENT_STATUS_FILTERS as readonly string[]).includes(status)) ||
      (method && !(PAYMENT_METHODS as readonly string[]).includes(method))
    ) {
      throw new ProException('INVALID_PAYMENT_FILTER');
    }
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit, 20, 100);

    const qb = this.listQuery()
      .leftJoin(User, 'u', 'u.id = pay.userId')
      .addSelect('u.email', 'userEmail')
      .addSelect('u.firstName', 'userFirstName')
      .addSelect('u.lastName', 'userLastName')
      .where('1 = 1');
    if (status) qb.andWhere('pay.status = :status', { status });
    if (method) qb.andWhere('pay.method = :method', { method });
    if (query.venueId) {
      qb.andWhere('pay.venueId = :venueId', { venueId: query.venueId });
    }
    const term = query.search?.trim();
    if (term) {
      qb.andWhere(
        "(u.email LIKE :search OR u.firstName LIKE :search OR u.lastName LIKE :search OR CONCAT(COALESCE(u.firstName, ''), ' ', COALESCE(u.lastName, '')) LIKE :search OR pay.omiseChargeId = :exact)",
        { search: `%${escapeLike(term)}%`, exact: term },
      );
    }

    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('pay.createdAt', 'DESC')
      .addOrderBy('pay.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<PaymentRow>();
    return {
      items: rows.map((row) => ({
        id: row.id,
        user: row.userEmail
          ? {
              id: row.userId,
              email: row.userEmail,
              firstName: row.userFirstName ?? null,
              lastName: row.userLastName ?? null,
            }
          : null,
        venue: venueOf(row),
        plan: planOf(row),
        method: row.method,
        status: row.status,
        isRenewal: bool(row.isRenewal),
        subtotalSatang: Number(row.subtotalSatang),
        vatSatang: Number(row.vatSatang),
        totalSatang: Number(row.totalSatang),
        omiseChargeId: row.omiseChargeId ?? null,
        subscriptionId: row.subscriptionId ?? null,
        failureCode: row.failureCode ?? null,
        failureMessage: row.failureMessage ?? null,
        refundRequired: bool(row.refundRequired),
        paidAt: row.paidAt ?? null,
        createdAt: row.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── helpers ─────────────────────────────────────────────────────────

  private async isVatEnabled(): Promise<boolean> {
    const page = await this.pageRepository.findOne({
      where: { id: PRO_PAGE_ID },
    });
    return bool(page?.vatEnabled);
  }

  /** Where Opn sends the browser back after 3-D Secure / PromptPay. */
  private returnUri(paymentId: string): string | null {
    const base = this.frontendBase();
    return base ? `${base}/upgrade/result?payment=${paymentId}` : null;
  }

  /**
   * FRONTEND_URL without a trailing slash; not set → http://localhost:3000
   * in development, null in production (never send Opn to localhost).
   */
  private frontendBase(): string | null {
    const configured: unknown = this.configService.get('FRONTEND_URL');
    if (typeof configured === 'string' && configured.trim() !== '') {
      return configured.trim().replace(/\/+$/, '');
    }
    return this.configService.get('NODE_ENV') === 'production'
      ? null
      : 'http://localhost:3000';
  }

  /** true = this caller may ask Opn now (≥ 5 s since the last ask). */
  private async claimSync(id: string, now: Date): Promise<boolean> {
    const at = floorToSecond(now);
    const cutoff = new Date(at.getTime() - SYNC_THROTTLE_MS);
    const result = await this.paymentsRepository
      .createQueryBuilder()
      .update(ProPayment)
      .set({ lastCheckedAt: at })
      .where(
        'id = :id AND (lastCheckedAt IS NULL OR lastCheckedAt <= :cutoff)',
        {
          id,
          cutoff,
        },
      )
      .execute();
    return (result.affected ?? 0) > 0;
  }

  private async findOwnSubscription(
    userId: string,
    id: string,
  ): Promise<ProSubscription> {
    const sub = isUUID(id)
      ? await this.subscriptionsRepository.findOne({ where: { id } })
      : null;
    if (!sub || sub.userId !== userId) {
      throw new ProException('SUBSCRIPTION_NOT_FOUND');
    }
    return sub;
  }

  private async toView(payment: ProPayment): Promise<PaymentView> {
    const [plan, sub] = await Promise.all([
      this.plansRepository.findOne({
        where: { id: payment.planId },
        relations: { venue: true },
      }),
      payment.subscriptionId
        ? this.subscriptionsRepository.findOne({
            where: { id: payment.subscriptionId },
          })
        : Promise.resolve(null),
    ]);
    const pendingQr =
      payment.status === String(ProPaymentStatus.PENDING) &&
      payment.method === String(ProPaymentMethod.PROMPTPAY);
    return {
      id: payment.id,
      status: payment.status,
      method: payment.method,
      isRenewal: bool(payment.isRenewal),
      totalSatang: payment.totalSatang,
      subtotalSatang: payment.subtotalSatang,
      vatSatang: payment.vatSatang,
      discountSatang: payment.discountSatang,
      currency: payment.currency,
      qrImageUrl: pendingQr ? payment.qrImageUrl : null,
      expiresAt: payment.expiresAt ?? null,
      failureMessage: payment.failureMessage ?? null,
      refundRequired: bool(payment.refundRequired),
      paidAt: payment.paidAt ?? null,
      createdAt: payment.createdAt,
      plan: plan ? { id: plan.id, code: plan.code, name: plan.name } : null,
      venue: plan?.venue
        ? { id: plan.venue.id, key: plan.venue.key, name: plan.venue.name }
        : null,
      subscription: sub
        ? {
            id: sub.id,
            currentPeriodEnd: sub.currentPeriodEnd,
            autoRenew: bool(sub.autoRenew),
          }
        : null,
    };
  }

  /** Payments with their venue and plan (raw rows). */
  private listQuery() {
    return this.paymentsRepository
      .createQueryBuilder('pay')
      .leftJoin(ProVenue, 'v', 'v.id = pay.venueId')
      .leftJoin(ProPlan, 'p', 'p.id = pay.planId')
      .select('pay.id', 'id')
      .addSelect('pay.status', 'status')
      .addSelect('pay.method', 'method')
      .addSelect('pay.isRenewal', 'isRenewal')
      .addSelect('pay.subtotalSatang', 'subtotalSatang')
      .addSelect('pay.vatSatang', 'vatSatang')
      .addSelect('pay.totalSatang', 'totalSatang')
      .addSelect('pay.omiseChargeId', 'omiseChargeId')
      .addSelect('pay.subscriptionId', 'subscriptionId')
      .addSelect('pay.failureCode', 'failureCode')
      .addSelect('pay.failureMessage', 'failureMessage')
      .addSelect('pay.refundRequired', 'refundRequired')
      .addSelect('pay.expiresAt', 'expiresAt')
      .addSelect('pay.paidAt', 'paidAt')
      .addSelect('pay.createdAt', 'createdAt')
      .addSelect('pay.userId', 'userId')
      .addSelect('pay.venueId', 'venueId')
      .addSelect('v.key', 'venueKey')
      .addSelect('v.name', 'venueName')
      .addSelect('pay.planId', 'planId')
      .addSelect('p.code', 'planCode')
      .addSelect('p.name', 'planName');
  }
}

/**
 * The plan can be bought now: exists (else 404), visible, for sale, not
 * the free plan, price > 0, its venue active (else 400 PLAN_NOT_PURCHASABLE).
 */
export function assertPurchasable(
  plan: ProPlan | null | undefined,
  venue: Pick<ProVenue, 'isActive'> | null | undefined,
): asserts plan is ProPlan {
  if (!plan) throw new ProException('PLAN_NOT_FOUND');
  if (
    !bool(plan.isVisible) ||
    !bool(plan.isPurchasable) ||
    plan.rank <= 0 ||
    plan.priceSatang <= 0 ||
    !venue ||
    !bool(venue.isActive)
  ) {
    throw new ProException('PLAN_NOT_PURCHASABLE');
  }
}

function planOf(row: PaymentRow) {
  return row.planCode !== null && row.planCode !== undefined
    ? { id: row.planId, code: row.planCode, name: row.planName ?? '' }
    : null;
}

function venueOf(row: PaymentRow) {
  return row.venueKey !== null && row.venueKey !== undefined
    ? { id: row.venueId, key: row.venueKey, name: row.venueName ?? '' }
    : null;
}
