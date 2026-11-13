import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, MoreThan, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import type { AccessViewer } from '../exam-access/exam-access';
import { escapeLike } from '../unlock-codes/unlock-code-format';
import { ProPlan } from './pro-plan.entity';
import {
  ProSubscription,
  ProSubscriptionSource,
  ProSubscriptionStatus,
} from './pro-subscription.entity';
import { ProVenue } from './pro-venue.entity';
import { ProException, isMissingReference } from './pro-errors';
import { withUserLock } from './pro-user-lock';
import { ProBillingService } from './pro-billing.service';
import {
  GrantProSubscriptionDto,
  RevokeProSubscriptionDto,
  SUBSCRIPTION_STATUS_FILTERS,
  SubscriptionStatusFilter,
} from './dto/pro.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `my` of GET /pro/upgrade: a subscription that gives rights now. */
export interface MySubscriptionSummary {
  venueId: string;
  planId: string;
  planCode: string | null;
  status: string;
  currentPeriodEnd: Date;
  autoRenew: boolean;
  // admin / card / promptpay (task 18)
  source: string;
}

/** GET /pro/me item. */
export interface MySubscriptionView extends MySubscriptionSummary {
  // subscription id (for cancel-renewal / change-card, task 18)
  id: string;
  venueKey: string | null;
  venueName: string | null;
  planName: string | null;
  currentPeriodStart: Date;
  // The card of this subscription (source card only): the card it was paid
  // with / its renewal schedule charges, •••• 4242
  cardBrand: string | null;
  cardLastDigits: string | null;
  // When the auto renewal was stopped (by the user, or because a renewal
  // charge failed); rights stay until the end
  canceledAt: Date | null;
  // A renewal charge failed (auto renewal stopped): renew by hand
  renewalFailedAt: Date | null;
}

/** A row of the admin member list (safe user fields only). */
export interface AdminSubscriptionView {
  id: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  venue: { id: string; key: string; name: string } | null;
  plan: { id: string; code: string; name: string; rank: number } | null;
  // Worked out from the end: an active row past its end → expired
  status: string;
  source: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  autoRenew: boolean;
  note: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface AdminSubscriptionList {
  items: AdminSubscriptionView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminSubscriptionQuery {
  page?: number;
  limit?: number;
  venueId?: string;
  planId?: string;
  status?: string;
  search?: string;
}

/** Raw row of the admin list query. */
interface SubscriptionRow {
  id: string;
  status: string;
  source: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  autoRenew: number | boolean | string;
  note: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  userId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  venueId: string;
  venueKey: string | null;
  venueName: string | null;
  planId: string;
  planCode: string | null;
  planName: string | null;
  planRank: number | string | null;
}

/**
 * Status shown for a stored row: `active` whose currentPeriodEnd is not
 * after now → `expired`; other values as stored.
 */
export function effectiveStatus(
  status: string,
  currentPeriodEnd: Date | null | undefined,
  now: Date,
): string {
  if (
    status === String(ProSubscriptionStatus.ACTIVE) &&
    (!currentPeriodEnd || currentPeriodEnd.getTime() <= now.getTime())
  ) {
    return ProSubscriptionStatus.EXPIRED;
  }
  return status;
}

function floorToSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function clampPage(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function clampLimit(value: unknown, fallback = 20, max = 100): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

const bool = (value: unknown) => value === true || Number(value) === 1;

/**
 * Pro subscriptions of users (task 17): the user's own (GET /pro/me), the
 * admin member list, and grants/revokes by an admin. Payments (task 18)
 * will add rows through the same per-user lock.
 */
@Injectable()
export class ProSubscriptionsService {
  constructor(
    @InjectRepository(ProSubscription)
    private subscriptionsRepository: Repository<ProSubscription>,
    @InjectRepository(ProPlan)
    private plansRepository: Repository<ProPlan>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private dataSource: DataSource,
    private billing: ProBillingService,
  ) {}

  // ── the user's own ──────────────────────────────────────────────────

  /** GET /pro/me: subscriptions that give rights now, latest end first. */
  async findMine(
    userId: string,
    now: Date = new Date(),
  ): Promise<MySubscriptionView[]> {
    const rows = await this.findActiveWithPlan(userId, now);
    return rows.map((s) => toMyView(s, now));
  }

  /**
   * One of the user's own subscriptions as in GET /pro/me (any status);
   * someone else's or missing → 404 SUBSCRIPTION_NOT_FOUND.
   */
  async findMineOne(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<MySubscriptionView> {
    const row = await this.subscriptionsRepository.findOne({
      where: { id, userId },
      relations: { venue: true, plan: true },
    });
    if (!row) throw new ProException('SUBSCRIPTION_NOT_FOUND');
    return toMyView(row, now);
  }

  /** `my` of GET /pro/upgrade. */
  async findMySummaries(
    userId: string,
    now: Date = new Date(),
  ): Promise<MySubscriptionSummary[]> {
    const rows = await this.findActiveWithPlan(userId, now);
    return rows.map((s) => ({
      venueId: s.venueId,
      planId: s.planId,
      planCode: s.plan?.code ?? null,
      status: effectiveStatus(s.status, s.currentPeriodEnd, now),
      currentPeriodEnd: s.currentPeriodEnd,
      autoRenew: bool(s.autoRenew),
      source: s.source,
    }));
  }

  private findActiveWithPlan(userId: string, now: Date) {
    return this.subscriptionsRepository.find({
      where: {
        userId,
        status: ProSubscriptionStatus.ACTIVE,
        currentPeriodEnd: MoreThan(now),
      },
      relations: { venue: true, plan: true },
      order: { currentPeriodEnd: 'DESC' },
    });
  }

  // ── admin ───────────────────────────────────────────────────────────

  /**
   * GET /pro/admin/subscriptions: newest first. status filters by the
   * shown status (expired = stored expired, or active past its end);
   * search matches the email or the name of the user.
   */
  async listForAdmin(
    query: AdminSubscriptionQuery,
    now: Date = new Date(),
  ): Promise<AdminSubscriptionList> {
    const status = query.status?.trim() || undefined;
    if (
      status &&
      !SUBSCRIPTION_STATUS_FILTERS.includes(status as SubscriptionStatusFilter)
    ) {
      throw new ProException('INVALID_STATUS_FILTER');
    }
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);

    const qb = this.viewQuery();
    if (query.venueId) {
      qb.andWhere('s.venueId = :venueId', { venueId: query.venueId });
    }
    if (query.planId) {
      qb.andWhere('s.planId = :planId', { planId: query.planId });
    }
    if (status === 'active') {
      qb.andWhere('s.status = :active AND s.currentPeriodEnd > :now', {
        active: ProSubscriptionStatus.ACTIVE,
        now,
      });
    } else if (status === 'expired') {
      qb.andWhere(
        '(s.status = :expired OR (s.status = :active AND s.currentPeriodEnd <= :now))',
        {
          expired: ProSubscriptionStatus.EXPIRED,
          active: ProSubscriptionStatus.ACTIVE,
          now,
        },
      );
    } else if (status === 'revoked') {
      qb.andWhere('s.status = :revoked', {
        revoked: ProSubscriptionStatus.REVOKED,
      });
    }
    const term = query.search?.trim();
    if (term) {
      qb.andWhere(
        "(u.email LIKE :search OR u.firstName LIKE :search OR u.lastName LIKE :search OR CONCAT(COALESCE(u.firstName, ''), ' ', COALESCE(u.lastName, '')) LIKE :search)",
        { search: `%${escapeLike(term)}%` },
      );
    }

    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('s.createdAt', 'DESC')
      .addOrderBy('s.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<SubscriptionRow>();

    return {
      items: rows.map((row) => toAdminView(row, now)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** One row of the admin list by id (404 when missing). */
  async findAdminView(
    id: string,
    now: Date = new Date(),
  ): Promise<AdminSubscriptionView> {
    const row = await this.viewQuery()
      .andWhere('s.id = :id', { id })
      .getRawOne<SubscriptionRow>();
    if (!row) throw new ProException('SUBSCRIPTION_NOT_FOUND');
    return toAdminView(row, now);
  }

  /**
   * POST /pro/admin/subscriptions: give `plan` to the user with `email`
   * for `days` days from now. An active subscription of the same venue is
   * replaced (that row → revoked; one already past its end → expired), so
   * the user keeps exactly one active row per venue. All of it runs under
   * the user's row lock (withUserLock): two grants at once for the same
   * user run one after the other and the second replaces the first.
   * Errors: user not found 404, plan not found 404, free plan (rank 0) 400.
   */
  async grant(
    input: GrantProSubscriptionDto,
    admin: AccessViewer,
    now: Date = new Date(),
  ): Promise<AdminSubscriptionView> {
    const email = input.email.trim();
    const user = await this.usersRepository.findOne({
      select: { id: true },
      where: { email },
      loadEagerRelations: false,
    });
    if (!user) throw new ProException('USER_NOT_FOUND');
    const plan = await this.findGrantablePlan(input.planId);

    // Whole seconds: datetime columns have no fraction
    const start = floorToSecond(now);
    const end = new Date(start.getTime() + input.days * DAY_MS);
    const id = randomUUID();

    let schedules: string[] = [];
    try {
      schedules = await withUserLock(this.dataSource, user.id, (manager) =>
        this.replaceActive(manager, {
          id,
          userId: user.id,
          planId: plan.id,
          start,
          end,
          note: nullableText(input.note),
          adminId: admin.id,
        }),
      );
    } catch (err) {
      // Venue/plan deleted between the read and the insert (FK 1452)
      if (isMissingReference(err)) throw new ProException('PLAN_NOT_FOUND');
      throw err;
    }
    // Card rows that were replaced stop renewing at Opn (task 18)
    for (const scheduleId of schedules) {
      await this.billing.cancelScheduleQuietly(scheduleId);
    }

    return this.findAdminView(id, now);
  }

  /**
   * The write of grant, under the user lock. Lock order users → venue →
   * plan, the same as the admin edits of venues/plans (venue X → plan X),
   * so a grant racing a plan edit or a venue delete waits instead of
   * deadlocking:
   *   1. read the plan without a lock, only for its venueId (never changes)
   *   2. shared lock on the venue (deleted meanwhile → 404 PLAN_NOT_FOUND)
   *   3. shared lock on the plan, read again: deleted → 404, rank 0 → 400
   * then end the active row of the venue (by primary key, see below) and
   * insert the new one (the FK checks of the insert need the S locks
   * already held). Returns the Opn schedules of the ended rows (deleted
   * after the commit, task 18).
   */
  private async replaceActive(
    manager: EntityManager,
    row: {
      id: string;
      userId: string;
      planId: string;
      start: Date;
      end: Date;
      note: string | null;
      adminId: string;
    },
  ): Promise<string[]> {
    const found = await manager.findOne(ProPlan, {
      select: { id: true, venueId: true },
      where: { id: row.planId },
    });
    if (!found) throw new ProException('PLAN_NOT_FOUND');
    const venue = await manager.findOne(ProVenue, {
      select: { id: true },
      where: { id: found.venueId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!venue) throw new ProException('PLAN_NOT_FOUND');
    const plan = await manager.findOne(ProPlan, {
      where: { id: row.planId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!plan) throw new ProException('PLAN_NOT_FOUND');
    if (plan.rank <= 0) throw new ProException('FREE_PLAN_GRANT');

    // The user's active rows of the venue: a plain read is enough (no other
    // writer of this user while the user lock is held, and the read view
    // starts after the lock, so it sees what the previous writer committed).
    // They are then changed by primary key only: an UPDATE with a range
    // condition would take next-key (gap) locks across other users' index
    // entries and deadlock with their grants' inserts.
    const active = await manager.find(ProSubscription, {
      select: { id: true, currentPeriodEnd: true, omiseScheduleId: true },
      where: {
        userId: row.userId,
        venueId: plan.venueId,
        status: ProSubscriptionStatus.ACTIVE,
      },
    });
    const replaced = active
      .filter((s) => s.currentPeriodEnd.getTime() > row.start.getTime())
      .map((s) => s.id);
    const ended = active
      .filter((s) => s.currentPeriodEnd.getTime() <= row.start.getTime())
      .map((s) => s.id);
    if (replaced.length > 0) {
      await manager.update(
        ProSubscription,
        { id: In(replaced) },
        {
          status: ProSubscriptionStatus.REVOKED,
          revokedAt: row.start,
          revokedById: row.adminId,
          autoRenew: false,
        },
      );
    }
    if (ended.length > 0) {
      await manager.update(
        ProSubscription,
        { id: In(ended) },
        { status: ProSubscriptionStatus.EXPIRED, autoRenew: false },
      );
    }
    await manager.insert(ProSubscription, {
      id: row.id,
      userId: row.userId,
      venueId: plan.venueId,
      planId: plan.id,
      status: ProSubscriptionStatus.ACTIVE,
      source: ProSubscriptionSource.ADMIN,
      currentPeriodStart: row.start,
      currentPeriodEnd: row.end,
      autoRenew: false,
      note: row.note,
      grantedById: row.adminId,
      revokedAt: null,
      revokedById: null,
    });
    return active.map((s) => s.omiseScheduleId).filter((s): s is string => !!s);
  }

  /**
   * POST /pro/admin/subscriptions/:id/revoke: an active row → revoked now
   * (a note, when sent, replaces the row's note). Already revoked → 409
   * ALREADY_REVOKED; another status (expired by a later grant) → 409
   * NOT_ACTIVE. The update is conditional, so two revokes at once give one
   * success and one 409.
   */
  async revoke(
    id: string,
    input: RevokeProSubscriptionDto,
    admin: AccessViewer,
    now: Date = new Date(),
  ): Promise<AdminSubscriptionView> {
    const row = await this.subscriptionsRepository.findOne({ where: { id } });
    if (!row) throw new ProException('SUBSCRIPTION_NOT_FOUND');
    if (row.status !== String(ProSubscriptionStatus.ACTIVE)) {
      throw notActive(row.status);
    }

    const changes: Pick<
      ProSubscription,
      'status' | 'revokedAt' | 'revokedById'
    > & { note?: string; autoRenew?: boolean } = {
      status: ProSubscriptionStatus.REVOKED,
      revokedAt: floorToSecond(now),
      revokedById: admin.id,
      autoRenew: false,
    };
    const note = nullableText(input?.note);
    if (note) changes.note = note;

    const result = await this.subscriptionsRepository.update(
      { id, status: ProSubscriptionStatus.ACTIVE },
      changes,
    );
    if (!result.affected) {
      const latest = await this.subscriptionsRepository.findOne({
        where: { id },
      });
      throw notActive(latest?.status ?? ProSubscriptionStatus.REVOKED);
    }
    // A card row stops renewing at Opn (task 18)
    if (row.omiseScheduleId) {
      await this.billing.cancelScheduleQuietly(row.omiseScheduleId);
    }
    return this.findAdminView(id, now);
  }

  private async findGrantablePlan(planId: string): Promise<ProPlan> {
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) throw new ProException('PLAN_NOT_FOUND');
    if (plan.rank <= 0) throw new ProException('FREE_PLAN_GRANT');
    return plan;
  }

  /** Subscriptions with the user (safe fields only), venue and plan. */
  private viewQuery() {
    return this.subscriptionsRepository
      .createQueryBuilder('s')
      .leftJoin(User, 'u', 'u.id = s.userId')
      .leftJoin(ProVenue, 'v', 'v.id = s.venueId')
      .leftJoin(ProPlan, 'p', 'p.id = s.planId')
      .select('s.id', 'id')
      .addSelect('s.status', 'status')
      .addSelect('s.source', 'source')
      .addSelect('s.currentPeriodStart', 'currentPeriodStart')
      .addSelect('s.currentPeriodEnd', 'currentPeriodEnd')
      .addSelect('s.autoRenew', 'autoRenew')
      .addSelect('s.note', 'note')
      .addSelect('s.createdAt', 'createdAt')
      .addSelect('s.revokedAt', 'revokedAt')
      .addSelect('s.userId', 'userId')
      .addSelect('u.email', 'userEmail')
      .addSelect('u.firstName', 'userFirstName')
      .addSelect('u.lastName', 'userLastName')
      .addSelect('s.venueId', 'venueId')
      .addSelect('v.key', 'venueKey')
      .addSelect('v.name', 'venueName')
      .addSelect('s.planId', 'planId')
      .addSelect('p.code', 'planCode')
      .addSelect('p.name', 'planName')
      .addSelect('p.rank', 'planRank')
      .where('1 = 1');
  }
}

function toMyView(s: ProSubscription, now: Date): MySubscriptionView {
  const card = s.source === String(ProSubscriptionSource.CARD) ? s : null;
  return {
    id: s.id,
    venueId: s.venueId,
    venueKey: s.venue?.key ?? null,
    venueName: s.venue?.name ?? null,
    planId: s.planId,
    planCode: s.plan?.code ?? null,
    planName: s.plan?.name ?? null,
    status: effectiveStatus(s.status, s.currentPeriodEnd, now),
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    autoRenew: bool(s.autoRenew),
    source: s.source,
    cardBrand: card?.cardBrand ?? null,
    cardLastDigits: card?.cardLastDigits ?? null,
    canceledAt: s.canceledAt ?? null,
    renewalFailedAt: s.renewalFailedAt ?? null,
  };
}

function notActive(status: string): ProException {
  return new ProException(
    status === String(ProSubscriptionStatus.REVOKED)
      ? 'ALREADY_REVOKED'
      : 'NOT_ACTIVE',
  );
}

function toAdminView(row: SubscriptionRow, now: Date): AdminSubscriptionView {
  return {
    id: row.id,
    user: row.userEmail
      ? {
          id: row.userId,
          email: row.userEmail,
          firstName: row.userFirstName ?? null,
          lastName: row.userLastName ?? null,
        }
      : null,
    venue:
      row.venueKey !== null && row.venueKey !== undefined
        ? { id: row.venueId, key: row.venueKey, name: row.venueName ?? '' }
        : null,
    plan:
      row.planCode !== null && row.planCode !== undefined
        ? {
            id: row.planId,
            code: row.planCode,
            name: row.planName ?? '',
            rank: Number(row.planRank ?? 0),
          }
        : null,
    status: effectiveStatus(row.status, row.currentPeriodEnd, now),
    source: row.source,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    autoRenew: bool(row.autoRenew),
    note: row.note ?? null,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt ?? null,
  };
}
