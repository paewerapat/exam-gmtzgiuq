import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import type { AccessViewer } from '../exam-access/exam-access';
import { escapeLike } from '../unlock-codes/unlock-code-format';
import { ProDiscountCode, ProDiscountType } from './pro-discount-code.entity';
import {
  ProDiscountRedemption,
  ProDiscountRedemptionStatus,
} from './pro-discount-redemption.entity';
import { ProPayment } from './pro-payment.entity';
import { ProPlan } from './pro-plan.entity';
import { ProVenue } from './pro-venue.entity';
import { ProException, isDuplicateKey } from './pro-errors';
import { retryOnDeadlock } from './pro-user-lock';
import {
  DISCOUNT_AMOUNT_TOO_LOW_MESSAGE,
  DiscountedAmounts,
  computeDiscountSatang,
  discountScopeError,
  discountStateError,
  discountedAmounts,
  isLiveReservation,
  normalizeDiscountCode,
} from './pro-discount-rules';
import { countDiscountUses } from './pro-discount-ledger';
import {
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
} from './dto/pro-discounts.dto';

/** A code that applies to the plan, with the amounts it gives. */
export interface AppliedDiscount {
  codeId: string;
  code: string;
  type: string;
  value: number;
  maxRedemptions: number | null;
  perUserLimit: number;
  amounts: DiscountedAmounts;
}

/** `discount` of GET /pro/checkout/quote */
export interface QuoteDiscount {
  code: string;
  type: string;
  value: number;
  discountSatang: number;
}

/** The plan being bought (only what the rules need). */
export interface DiscountPlan {
  id: string;
  venueId: string;
  priceSatang: number;
}

/** A row of GET /pro/admin/discount-codes */
export interface AdminDiscountCodeView {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  venueId: string | null;
  planId: string | null;
  venue: { id: string; key: string; name: string } | null;
  plan: { id: string; code: string; name: string } | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perUserLimit: number;
  isActive: boolean;
  // successful payments with the code
  redeemedCount: number;
  // reserved by payments still pending (they count toward the limits)
  reservedCount: number;
  // active / inactive / scheduled / expired / used_up (now)
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A row of GET /pro/admin/discount-codes/:id/redemptions (safe user fields). */
export interface AdminRedemptionView {
  id: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  paymentId: string;
  amountSatang: number;
  status: string;
  payment: {
    status: string;
    method: string;
    totalSatang: number;
    paidAt: Date | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiscountPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface RedemptionRow {
  id: string;
  paymentId: string;
  amountSatang: number | string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentTotal: number | string | null;
  paymentPaidAt: Date | null;
}

const bool = (value: unknown) => value === true || Number(value) === 1;

function clampPage(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** ISO string (validated by the DTO) → Date in whole seconds. */
function parseInstant(value: string): Date {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 1000 || year > 9999) {
    throw new ProException('DISCOUNT_PERIOD_INVALID');
  }
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/** percent 1–100; amount ≥ 100 satang (1 baht). */
function assertValue(type: string, value: number): void {
  const ok =
    type === String(ProDiscountType.PERCENT)
      ? value >= 1 && value <= 100
      : value >= 100;
  if (!Number.isInteger(value) || !ok) {
    throw new ProException('DISCOUNT_VALUE_INVALID');
  }
}

/**
 * Discount codes of the Pro checkout (task 19): the checks made by quote
 * and checkout (resolve + countDiscountUses) and the admin pages. Amounts
 * are always worked out here from the plan row, never taken from a client.
 */
@Injectable()
export class ProDiscountsService {
  constructor(
    @InjectRepository(ProDiscountCode)
    private codesRepository: Repository<ProDiscountCode>,
    @InjectRepository(ProDiscountRedemption)
    private redemptionsRepository: Repository<ProDiscountRedemption>,
    @InjectRepository(ProPlan)
    private plansRepository: Repository<ProPlan>,
    @InjectRepository(ProVenue)
    private venuesRepository: Repository<ProVenue>,
    private dataSource: DataSource,
  ) {}

  // ── quote / checkout ────────────────────────────────────────────────

  /**
   * The typed code for this plan: found (format / missing → 400
   * DISCOUNT_NOT_FOUND), on, started, not ended, for this venue / plan, and
   * the amounts (VAT on the price after the discount; the whole price off
   * → DISCOUNT_TOO_LARGE; under 20 baht → AMOUNT_TOO_LOW). The limits are
   * checked by assertCapacity. `lock`: inside checkout the code row is
   * locked FOR UPDATE (this must be the first plain read of the
   * transaction after the venue / plan locks, see countDiscountUses).
   */
  async resolve(
    manager: EntityManager,
    rawCode: unknown,
    plan: DiscountPlan,
    vatEnabled: boolean,
    now: Date,
    lock: boolean,
  ): Promise<AppliedDiscount> {
    const row = await this.findUsable(manager, rawCode, plan, now, lock);
    return this.withAmounts(row, plan, vatEnabled);
  }

  /** The first half of resolve: the row, checked for state and scope. */
  async findUsable(
    manager: EntityManager,
    rawCode: unknown,
    plan: DiscountPlan,
    now: Date,
    lock: boolean,
  ): Promise<ProDiscountCode> {
    const code = normalizeDiscountCode(rawCode);
    if (!code) throw new ProException('DISCOUNT_NOT_FOUND');
    const row = await manager.findOne(ProDiscountCode, {
      where: { code },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!row) throw new ProException('DISCOUNT_NOT_FOUND');
    const problem =
      discountStateError(row, now) ?? discountScopeError(row, plan);
    if (problem) throw new ProException(problem);
    return row;
  }

  /** The second half of resolve: the amounts the code gives for the plan. */
  withAmounts(
    row: ProDiscountCode,
    plan: DiscountPlan,
    vatEnabled: boolean,
  ): AppliedDiscount {
    const amounts = discountedAmounts(
      plan.priceSatang,
      vatEnabled,
      computeDiscountSatang(
        row.discountType,
        row.discountValue,
        plan.priceSatang,
      ),
    );
    if ('error' in amounts) {
      throw new ProException(
        amounts.error,
        amounts.error === 'AMOUNT_TOO_LOW'
          ? DISCOUNT_AMOUNT_TOO_LOW_MESSAGE
          : undefined,
      );
    }
    return {
      codeId: row.id,
      code: row.code,
      type: row.discountType,
      value: row.discountValue,
      maxRedemptions: row.maxRedemptions ?? null,
      perUserLimit: row.perUserLimit,
      amounts,
    };
  }

  /**
   * maxRedemptions (used + live reserved of everyone) → 400
   * DISCOUNT_USED_UP; perUserLimit (the user's) → 400 DISCOUNT_ALREADY_USED.
   * `excludePaymentIds`: the user's pending payments the checkout replaces.
   */
  async assertCapacity(
    manager: EntityManager,
    applied: Pick<
      AppliedDiscount,
      'codeId' | 'maxRedemptions' | 'perUserLimit'
    >,
    userId: string,
    now: Date,
    excludePaymentIds: string[] = [],
  ): Promise<void> {
    const uses = await countDiscountUses(
      manager,
      applied.codeId,
      userId,
      now,
      excludePaymentIds,
    );
    if (
      applied.maxRedemptions !== null &&
      uses.total >= applied.maxRedemptions
    ) {
      throw new ProException('DISCOUNT_USED_UP');
    }
    if (uses.mine >= Math.max(1, applied.perUserLimit)) {
      throw new ProException('DISCOUNT_ALREADY_USED');
    }
  }

  /** GET /pro/checkout/quote: resolve + assertCapacity without locks. */
  async evaluateForQuote(
    rawCode: unknown,
    plan: DiscountPlan,
    vatEnabled: boolean,
    userId: string,
    now: Date,
    excludePaymentIds: string[],
  ): Promise<AppliedDiscount> {
    const manager = this.dataSource.manager;
    const applied = await this.resolve(
      manager,
      rawCode,
      plan,
      vatEnabled,
      now,
      false,
    );
    await this.assertCapacity(manager, applied, userId, now, excludePaymentIds);
    return applied;
  }

  // ── admin ───────────────────────────────────────────────────────────

  /**
   * GET /pro/admin/discount-codes: newest first; search = code or
   * description; isActive = 'true' / 'false'.
   */
  async listForAdmin(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      isActive?: string;
    },
    now: Date = new Date(),
  ): Promise<DiscountPage<AdminDiscountCodeView>> {
    const active = query.isActive?.trim() || undefined;
    if (active && active !== 'true' && active !== 'false') {
      throw new ProException('INVALID_DISCOUNT_FILTER');
    }
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit, 20, 100);
    const qb = this.codesRepository.createQueryBuilder('dc').where('1 = 1');
    if (active) {
      qb.andWhere('dc.isActive = :active', { active: active === 'true' });
    }
    const term = query.search?.trim();
    if (term) {
      qb.andWhere('(dc.code LIKE :search OR dc.description LIKE :search)', {
        search: `%${escapeLike(term)}%`,
      });
    }
    const [rows, total] = await qb
      .orderBy('dc.createdAt', 'DESC')
      .addOrderBy('dc.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: await this.toViews(rows, now),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** GET /pro/admin/discount-codes/:id (404 DISCOUNT_CODE_NOT_FOUND). */
  async getForAdmin(
    id: string,
    now: Date = new Date(),
  ): Promise<AdminDiscountCodeView> {
    const row = await this.codesRepository.findOne({ where: { id } });
    if (!row) throw new ProException('DISCOUNT_CODE_NOT_FOUND');
    const [view] = await this.toViews([row], now);
    return view;
  }

  /** POST /pro/admin/discount-codes (code taken → 409 DISCOUNT_CODE_TAKEN). */
  async create(
    input: CreateDiscountCodeDto,
    admin: AccessViewer,
    now: Date = new Date(),
  ): Promise<AdminDiscountCodeView> {
    const values = await this.checkedValues({
      code: input.code.trim().toUpperCase(),
      description: nullableText(input.description),
      discountType: input.discountType,
      discountValue: input.discountValue,
      venueId: input.venueId ?? null,
      planId: input.planId ?? null,
      startsAt: input.startsAt ? parseInstant(input.startsAt) : null,
      endsAt: input.endsAt ? parseInstant(input.endsAt) : null,
      maxRedemptions: input.maxRedemptions ?? null,
      perUserLimit: input.perUserLimit ?? 1,
      isActive: input.isActive ?? true,
    });
    const id = randomUUID();
    try {
      await this.codesRepository.insert({
        id,
        ...values,
        redeemedCount: 0,
        createdById: admin.id,
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw new ProException('DISCOUNT_CODE_TAKEN');
      throw err;
    }
    return this.getForAdmin(id, now);
  }

  /**
   * PUT /pro/admin/discount-codes/:id — fields not sent stay. Under the
   * code row's lock (the same lock checkout takes before reserving): a
   * change of code / type / value while the code has a use (reserved or
   * used) → 409 DISCOUNT_IN_USE.
   */
  async update(
    id: string,
    input: UpdateDiscountCodeDto,
    now: Date = new Date(),
  ): Promise<AdminDiscountCodeView> {
    const current = await this.codesRepository.findOne({ where: { id } });
    if (!current) throw new ProException('DISCOUNT_CODE_NOT_FOUND');

    const venueSent = input.venueId !== undefined;
    const planSent = input.planId !== undefined;
    const values = await this.checkedValues({
      code:
        input.code !== undefined
          ? input.code.trim().toUpperCase()
          : current.code,
      description:
        input.description !== undefined
          ? nullableText(input.description)
          : current.description,
      discountType: input.discountType ?? current.discountType,
      discountValue: input.discountValue ?? current.discountValue,
      // a plan sent alone keeps / sets its venue; a venue sent alone keeps
      // the plan only when it is of that venue (checked below)
      venueId: venueSent
        ? (input.venueId ?? null)
        : planSent && input.planId
          ? null
          : current.venueId,
      planId: planSent ? (input.planId ?? null) : current.planId,
      startsAt:
        input.startsAt !== undefined
          ? input.startsAt
            ? parseInstant(input.startsAt)
            : null
          : current.startsAt,
      endsAt:
        input.endsAt !== undefined
          ? input.endsAt
            ? parseInstant(input.endsAt)
            : null
          : current.endsAt,
      maxRedemptions:
        input.maxRedemptions !== undefined
          ? input.maxRedemptions
          : current.maxRedemptions,
      perUserLimit: input.perUserLimit ?? current.perUserLimit,
      isActive:
        typeof input.isActive === 'boolean'
          ? input.isActive
          : bool(current.isActive),
    });

    try {
      await retryOnDeadlock(() =>
        this.dataSource.transaction(async (manager) => {
          const locked = await manager.findOne(ProDiscountCode, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!locked) throw new ProException('DISCOUNT_CODE_NOT_FOUND');
          const fixedChanged =
            values.code !== locked.code ||
            values.discountType !== locked.discountType ||
            values.discountValue !== locked.discountValue;
          if (fixedChanged) {
            const uses = await manager.count(ProDiscountRedemption, {
              where: {
                codeId: id,
                status: In([
                  ProDiscountRedemptionStatus.RESERVED,
                  ProDiscountRedemptionStatus.USED,
                ]),
              },
            });
            if (uses > 0 || Number(locked.redeemedCount) > 0) {
              throw new ProException('DISCOUNT_IN_USE');
            }
          }
          await manager.update(ProDiscountCode, { id }, values);
        }),
      );
    } catch (err) {
      if (isDuplicateKey(err)) throw new ProException('DISCOUNT_CODE_TAKEN');
      throw err;
    }
    return this.getForAdmin(id, now);
  }

  /**
   * GET /pro/admin/discount-codes/:id/redemptions: newest first, limit ≤
   * 100, with the user (safe fields) and the payment.
   */
  async listRedemptions(
    id: string,
    pageInput?: number,
    limitInput?: number,
  ): Promise<DiscountPage<AdminRedemptionView>> {
    const exists = await this.codesRepository.findOne({
      select: { id: true },
      where: { id },
    });
    if (!exists) throw new ProException('DISCOUNT_CODE_NOT_FOUND');
    const page = clampPage(pageInput);
    const limit = clampLimit(limitInput, 20, 100);
    const qb = this.redemptionsRepository
      .createQueryBuilder('r')
      .leftJoin(User, 'u', 'u.id = r.userId')
      .leftJoin(ProPayment, 'pay', 'pay.id = r.paymentId')
      .select('r.id', 'id')
      .addSelect('r.paymentId', 'paymentId')
      .addSelect('r.amountSatang', 'amountSatang')
      .addSelect('r.status', 'status')
      .addSelect('r.createdAt', 'createdAt')
      .addSelect('r.updatedAt', 'updatedAt')
      .addSelect('r.userId', 'userId')
      .addSelect('u.email', 'userEmail')
      .addSelect('u.firstName', 'userFirstName')
      .addSelect('u.lastName', 'userLastName')
      .addSelect('pay.status', 'paymentStatus')
      .addSelect('pay.method', 'paymentMethod')
      .addSelect('pay.totalSatang', 'paymentTotal')
      .addSelect('pay.paidAt', 'paymentPaidAt')
      .where('r.codeId = :id', { id });
    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<RedemptionRow>();
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
        paymentId: row.paymentId,
        amountSatang: Number(row.amountSatang),
        status: row.status,
        payment: row.paymentStatus
          ? {
              status: row.paymentStatus,
              method: row.paymentMethod ?? '',
              totalSatang: Number(row.paymentTotal ?? 0),
              paidAt: row.paymentPaidAt ?? null,
            }
          : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Checks of the stored values: value in range for the type, endsAt after
   * startsAt, scope: a plan must exist and be paid (rank > 0) and its venue
   * becomes the code's venue (another venue sent → 400
   * DISCOUNT_SCOPE_INVALID); a venue alone must exist.
   */
  private async checkedValues(values: {
    code: string;
    description: string | null;
    discountType: string;
    discountValue: number;
    venueId: string | null;
    planId: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    maxRedemptions: number | null;
    perUserLimit: number;
    isActive: boolean;
  }) {
    assertValue(values.discountType, values.discountValue);
    if (
      values.startsAt &&
      values.endsAt &&
      values.endsAt.getTime() <= values.startsAt.getTime()
    ) {
      throw new ProException('DISCOUNT_PERIOD_INVALID');
    }
    let venueId = values.venueId;
    if (values.planId) {
      const plan = await this.plansRepository.findOne({
        where: { id: values.planId },
      });
      if (!plan) throw new ProException('PLAN_NOT_FOUND');
      if (plan.rank <= 0 || (venueId && venueId !== plan.venueId)) {
        throw new ProException('DISCOUNT_SCOPE_INVALID');
      }
      venueId = plan.venueId;
    } else if (venueId) {
      const venue = await this.venuesRepository.findOne({
        where: { id: venueId },
      });
      if (!venue) throw new ProException('VENUE_NOT_FOUND');
    }
    return { ...values, venueId };
  }

  /** Venue / plan names and live reserved counts of a page of codes. */
  private async toViews(
    rows: ProDiscountCode[],
    now: Date,
  ): Promise<AdminDiscountCodeView[]> {
    if (rows.length === 0) return [];
    const venueIds = [
      ...new Set(rows.map((r) => r.venueId).filter((v): v is string => !!v)),
    ];
    const planIds = [
      ...new Set(rows.map((r) => r.planId).filter((v): v is string => !!v)),
    ];
    const [venues, plans, reserved] = await Promise.all([
      venueIds.length > 0
        ? this.venuesRepository.find({ where: { id: In(venueIds) } })
        : Promise.resolve([] as ProVenue[]),
      planIds.length > 0
        ? this.plansRepository.find({ where: { id: In(planIds) } })
        : Promise.resolve([] as ProPlan[]),
      this.redemptionsRepository.find({
        select: { id: true, codeId: true, paymentId: true },
        where: {
          codeId: In(rows.map((r) => r.id)),
          status: ProDiscountRedemptionStatus.RESERVED,
        },
      }),
    ]);
    const payments =
      reserved.length > 0
        ? await this.dataSource.manager.find(ProPayment, {
            select: {
              id: true,
              status: true,
              expiresAt: true,
              createdAt: true,
            },
            where: { id: In(reserved.map((r) => r.paymentId)) },
          })
        : [];
    const liveByCode = new Map<string, number>();
    for (const r of reserved) {
      const payment = payments.find((p) => p.id === r.paymentId);
      if (isLiveReservation(payment, now)) {
        liveByCode.set(r.codeId, (liveByCode.get(r.codeId) ?? 0) + 1);
      }
    }

    return rows.map((row) => {
      const venue = venues.find((v) => v.id === row.venueId);
      const plan = plans.find((p) => p.id === row.planId);
      const reservedCount = liveByCode.get(row.id) ?? 0;
      const redeemedCount = Number(row.redeemedCount ?? 0);
      const isActive = bool(row.isActive);
      const state = discountStateError({ ...row, isActive }, now);
      const status =
        state === 'DISCOUNT_INACTIVE'
          ? 'inactive'
          : state === 'DISCOUNT_NOT_STARTED'
            ? 'scheduled'
            : state === 'DISCOUNT_EXPIRED'
              ? 'expired'
              : row.maxRedemptions !== null &&
                  redeemedCount + reservedCount >= row.maxRedemptions
                ? 'used_up'
                : 'active';
      return {
        id: row.id,
        code: row.code,
        description: row.description ?? null,
        discountType: row.discountType,
        discountValue: row.discountValue,
        venueId: row.venueId ?? null,
        planId: row.planId ?? null,
        venue: venue
          ? { id: venue.id, key: venue.key, name: venue.name }
          : null,
        plan: plan ? { id: plan.id, code: plan.code, name: plan.name } : null,
        startsAt: row.startsAt ?? null,
        endsAt: row.endsAt ?? null,
        maxRedemptions: row.maxRedemptions ?? null,
        perUserLimit: row.perUserLimit,
        isActive,
        redeemedCount,
        reservedCount,
        status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }
}
