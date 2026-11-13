import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { Category } from '../categories/category.entity';
import type { AccessViewer } from '../exam-access/exam-access';
import { ProPage, PRO_PAGE_ID } from './pro-page.entity';
import { ProPlan } from './pro-plan.entity';
import { ProSubscription } from './pro-subscription.entity';
import { ProVenue } from './pro-venue.entity';
import {
  ProComparison,
  comparisonForPlans,
  normalizeStoredComparison,
  prepareComparison,
} from './pro-comparison';
import {
  ProEntitlements,
  normalizeStoredEntitlements,
  prepareEntitlements,
} from './pro-entitlements';
import { ProException, isDuplicateKey, isRowReferenced } from './pro-errors';
import { retryOnDeadlock } from './pro-user-lock';
import {
  CreateProPlanDto,
  CreateProVenueDto,
  UpdateProPageDto,
  UpdateProPlanDto,
  UpdateProVenueDto,
} from './dto/pro.dto';
import {
  MySubscriptionSummary,
  ProSubscriptionsService,
} from './pro-subscriptions.service';

export interface ProPageView {
  title: string;
  subtitle: string | null;
  venuePickerTitle: string | null;
  footerNote: string | null;
}

/** A plan card of the public Upgrade page (no entitlements). */
export interface PublicPlanView {
  id: string;
  code: string;
  rank: number;
  name: string;
  tagline: string | null;
  priceSatang: number;
  priceUnit: string | null;
  priceNote: string | null;
  buttonText: string;
  badge: string | null;
  highlight: boolean;
  isPurchasable: boolean;
}

export interface PublicVenueView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  comparison: ProComparison | null;
  plans: PublicPlanView[];
}

export interface UpgradePageView {
  page: ProPageView;
  venues: PublicVenueView[];
  my: MySubscriptionSummary[];
}

/** Every field of a plan, entitlements included (admin only). */
export interface AdminPlanView extends PublicPlanView {
  venueId: string;
  periodDays: number;
  sortOrder: number;
  isVisible: boolean;
  entitlements: ProEntitlements;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminVenueView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  comparison: ProComparison | null;
  createdAt: Date;
  updatedAt: Date;
  plans: AdminPlanView[];
}

export interface AdminConfigView {
  page: ProPageView;
  venues: AdminVenueView[];
  // Same plans as venues[].plans, flat (every venue)
  plans: AdminPlanView[];
}

const EMPTY_PAGE: ProPageView = {
  title: '',
  subtitle: null,
  venuePickerTitle: null,
  footerNote: null,
};

/** Trimmed text; blank / null → null. */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

const bool = (value: unknown) => value === true || Number(value) === 1;

/**
 * Upgrade page content (task 17): page text, venues, plans and comparison
 * tables, all edited by admins. Nothing about plans is hard-coded: names,
 * prices, rights and the number of plans come from the DB.
 */
@Injectable()
export class ProConfigService {
  constructor(
    @InjectRepository(ProPage)
    private pageRepository: Repository<ProPage>,
    @InjectRepository(ProVenue)
    private venuesRepository: Repository<ProVenue>,
    @InjectRepository(ProPlan)
    private plansRepository: Repository<ProPlan>,
    private dataSource: DataSource,
    private subscriptionsService: ProSubscriptionsService,
  ) {}

  // ── public ──────────────────────────────────────────────────────────

  /**
   * GET /pro/upgrade: active venues and their visible plans in sortOrder,
   * comparison cells of visible plans only, never entitlements. `my` = the
   * viewer's subscriptions that give rights now ([] for a guest).
   */
  async getUpgrade(
    viewer: AccessViewer | null | undefined,
    now: Date = new Date(),
  ): Promise<UpgradePageView> {
    const [page, venues, plans, my] = await Promise.all([
      this.getPage(),
      this.venuesRepository.find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
      this.plansRepository.find({
        where: { isVisible: true },
        order: { sortOrder: 'ASC', rank: 'ASC', createdAt: 'ASC' },
      }),
      viewer?.id
        ? this.subscriptionsService.findMySummaries(viewer.id, now)
        : Promise.resolve([]),
    ]);

    return {
      page,
      venues: venues.map((venue) => {
        const venuePlans = plans.filter((p) => p.venueId === venue.id);
        return {
          id: venue.id,
          key: venue.key,
          name: venue.name,
          description: venue.description ?? null,
          comparison: comparisonForPlans(
            normalizeStoredComparison(venue.comparison),
            venuePlans.map((p) => p.code),
          ),
          plans: venuePlans.map(toPublicPlan),
        };
      }),
      my,
    };
  }

  // ── admin: page ─────────────────────────────────────────────────────

  async getPage(): Promise<ProPageView> {
    const row = await this.pageRepository.findOne({
      where: { id: PRO_PAGE_ID },
    });
    return row ? toPageView(row) : { ...EMPTY_PAGE };
  }

  /** PUT /pro/admin/page: creates the row when it is missing. */
  async updatePage(input: UpdateProPageDto): Promise<ProPageView> {
    const changes: Partial<ProPage> = {};
    if (input.title !== undefined) changes.title = input.title.trim();
    if (input.subtitle !== undefined) {
      changes.subtitle = nullableText(input.subtitle);
    }
    if (input.venuePickerTitle !== undefined) {
      changes.venuePickerTitle = nullableText(input.venuePickerTitle);
    }
    if (input.footerNote !== undefined) {
      changes.footerNote = nullableText(input.footerNote);
    }
    if (Object.keys(changes).length > 0) {
      await this.pageRepository.upsert({ id: PRO_PAGE_ID, ...changes }, ['id']);
    }
    return this.getPage();
  }

  // ── admin: config ───────────────────────────────────────────────────

  /** GET /pro/admin/config: every venue and plan (inactive/hidden too). */
  async getAdminConfig(): Promise<AdminConfigView> {
    const [page, venues, plans] = await Promise.all([
      this.getPage(),
      this.venuesRepository.find({ order: { sortOrder: 'ASC', name: 'ASC' } }),
      this.plansRepository.find({
        order: { sortOrder: 'ASC', rank: 'ASC', createdAt: 'ASC' },
      }),
    ]);
    const planViews = plans.map(toAdminPlan);
    return {
      page,
      venues: venues.map((venue) =>
        toAdminVenue(
          venue,
          planViews.filter((p) => p.venueId === venue.id),
        ),
      ),
      plans: planViews,
    };
  }

  // ── admin: venues ───────────────────────────────────────────────────

  async createVenue(input: CreateProVenueDto): Promise<AdminVenueView> {
    await this.assertVenueKeyFree(input.key);
    const venue = this.venuesRepository.create({
      key: input.key,
      name: input.name.trim(),
      description: nullableText(input.description),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      comparison: null,
    });
    try {
      const saved = await this.venuesRepository.save(venue);
      return this.getAdminVenue(saved.id);
    } catch (err) {
      if (isDuplicateKey(err)) throw new ProException('VENUE_KEY_TAKEN');
      throw err;
    }
  }

  async updateVenue(
    id: string,
    input: UpdateProVenueDto,
  ): Promise<AdminVenueView> {
    const venue = await this.findVenueOrFail(id);
    const changes: Partial<ProVenue> = {};
    if (input.key !== undefined && input.key !== venue.key) {
      await this.assertVenueKeyFree(input.key, id);
      changes.key = input.key;
    }
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.description !== undefined) {
      changes.description = nullableText(input.description);
    }
    if (input.sortOrder !== undefined) changes.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) changes.isActive = input.isActive;
    if (input.comparison !== undefined) {
      changes.comparison = prepareComparison(input.comparison);
    }
    if (Object.keys(changes).length > 0) {
      try {
        await this.venuesRepository.update(id, changes);
      } catch (err) {
        if (isDuplicateKey(err)) throw new ProException('VENUE_KEY_TAKEN');
        throw err;
      }
    }
    return this.getAdminVenue(id);
  }

  /**
   * DELETE /pro/admin/venues/:id: only when no subscription refers to it
   * (else 409 VENUE_IN_USE: turn isActive off instead). Its plans go with it
   * and categories of the venue get venueId = null. Locks venue X, then
   * its plans X (the order of every Pro write, see withUserLock): a grant
   * holds a shared lock on the venue, so it either finishes first (then
   * counted → 409) or waits and finds the plan gone (404). The FKs of
   * pro_subscriptions are the last guard (1451 → 409); a deadlock is
   * retried, then 409 CONCURRENT_UPDATE.
   */
  async deleteVenue(id: string): Promise<{ success: true }> {
    try {
      await retryOnDeadlock(() =>
        this.dataSource.transaction(async (manager) => {
          const venue = await manager.findOne(ProVenue, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!venue) throw new ProException('VENUE_NOT_FOUND');
          await manager.find(ProPlan, {
            select: { id: true },
            where: { venueId: id },
            lock: { mode: 'pessimistic_write' },
          });
          const used = await manager.count(ProSubscription, {
            where: { venueId: id },
          });
          if (used > 0) throw new ProException('VENUE_IN_USE');
          await manager.update(Category, { venueId: id }, { venueId: null });
          await manager.delete(ProVenue, { id });
        }),
      );
    } catch (err) {
      if (isRowReferenced(err)) throw new ProException('VENUE_IN_USE');
      throw err;
    }
    return { success: true };
  }

  // ── admin: plans ────────────────────────────────────────────────────

  /**
   * POST /pro/admin/plans. Rules on the new plan: see assertPlanRules; a
   * venue has at most one free plan (rank 0) → 409 FREE_PLAN_EXISTS. The
   * venue row is locked while checking and inserting, so two admins adding
   * a free plan at once cannot both pass.
   */
  async createPlan(input: CreateProPlanDto): Promise<AdminPlanView> {
    await this.findVenueOrFail(input.venueId);
    await this.assertPlanCodeFree(input.venueId, input.code);

    const priceSatang = input.priceSatang ?? 0;
    const isPurchasable =
      input.isPurchasable ?? (input.rank > 0 && priceSatang > 0);
    const entitlements = prepareEntitlements(input.entitlements);
    assertPlanRules(input.rank, priceSatang, isPurchasable, entitlements);

    const plan = this.plansRepository.create({
      venueId: input.venueId,
      code: input.code,
      rank: input.rank,
      name: input.name.trim(),
      tagline: nullableText(input.tagline),
      priceSatang,
      priceUnit: nullableText(input.priceUnit),
      priceNote: nullableText(input.priceNote),
      periodDays: input.periodDays ?? 30,
      buttonText: input.buttonText.trim(),
      badge: nullableText(input.badge),
      highlight: input.highlight ?? false,
      sortOrder: input.sortOrder ?? 0,
      isVisible: input.isVisible ?? true,
      isPurchasable,
      entitlements,
    });
    let id: string;
    try {
      id = await retryOnDeadlock(() =>
        this.dataSource.transaction(async (manager) => {
          await lockVenue(manager, input.venueId);
          if (input.rank === 0) await assertNoOtherFreePlan(manager, plan);
          const saved = await manager.save(ProPlan, plan);
          return saved.id;
        }),
      );
    } catch (err) {
      if (isDuplicateKey(err)) throw new ProException('PLAN_CODE_TAKEN');
      throw err;
    }
    return this.getAdminPlan(id);
  }

  /**
   * PUT /pro/admin/plans/:id. The rules apply to the values the plan will
   * have after saving (not sent = current value). Becoming rank 0: 409
   * FREE_PLAN_EXISTS when the venue already has a free plan, 409
   * PLAN_RANK_IN_USE when a subscription refers to the plan. Checked with
   * venue X then plan X (the order of every Pro write): a grant takes
   * venue S then plan S, so it either finishes first and is counted, or
   * waits and sees rank 0. A deadlock is retried, then 409.
   */
  async updatePlan(
    id: string,
    input: UpdateProPlanDto,
  ): Promise<AdminPlanView> {
    const plan = await this.findPlanOrFail(id);
    const changes: Partial<ProPlan> = {};
    if (input.code !== undefined && input.code !== plan.code) {
      await this.assertPlanCodeFree(plan.venueId, input.code, id);
      changes.code = input.code;
    }
    if (input.rank !== undefined) changes.rank = input.rank;
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.tagline !== undefined) {
      changes.tagline = nullableText(input.tagline);
    }
    if (input.priceSatang !== undefined) {
      changes.priceSatang = input.priceSatang;
    }
    if (input.priceUnit !== undefined) {
      changes.priceUnit = nullableText(input.priceUnit);
    }
    if (input.priceNote !== undefined) {
      changes.priceNote = nullableText(input.priceNote);
    }
    if (input.periodDays !== undefined) changes.periodDays = input.periodDays;
    if (input.buttonText !== undefined) {
      changes.buttonText = input.buttonText.trim();
    }
    if (input.badge !== undefined) changes.badge = nullableText(input.badge);
    if (input.highlight !== undefined) changes.highlight = input.highlight;
    if (input.sortOrder !== undefined) changes.sortOrder = input.sortOrder;
    if (input.isVisible !== undefined) changes.isVisible = input.isVisible;
    if (input.isPurchasable !== undefined) {
      changes.isPurchasable = input.isPurchasable;
    }
    if (input.entitlements !== undefined) {
      changes.entitlements = prepareEntitlements(input.entitlements);
    }

    try {
      await retryOnDeadlock(() =>
        this.dataSource.transaction(async (manager) => {
          await lockVenue(manager, plan.venueId);
          const current = await manager.findOne(ProPlan, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!current) throw new ProException('PLAN_NOT_FOUND');

          const rank = changes.rank ?? current.rank;
          assertPlanRules(
            rank,
            changes.priceSatang ?? current.priceSatang,
            changes.isPurchasable ?? bool(current.isPurchasable),
            changes.entitlements ??
              normalizeStoredEntitlements(current.entitlements),
          );
          if (rank === 0 && current.rank !== 0) {
            await assertNoOtherFreePlan(manager, current);
            const used = await manager.count(ProSubscription, {
              where: { planId: id },
            });
            if (used > 0) throw new ProException('PLAN_RANK_IN_USE');
          }
          if (Object.keys(changes).length > 0) {
            await manager.save(ProPlan, { id, ...changes });
          }
        }),
      );
    } catch (err) {
      if (isDuplicateKey(err)) throw new ProException('PLAN_CODE_TAKEN');
      throw err;
    }
    return this.getAdminPlan(id);
  }

  /**
   * DELETE /pro/admin/plans/:id: only when no subscription refers to it
   * (else 409 PLAN_IN_USE: hide it instead). Comparison cells of its code
   * stay in the table and are simply not shown. Locks venue X then plan X
   * (the order of every Pro write); a deadlock is retried, then 409.
   */
  async deletePlan(id: string): Promise<{ success: true }> {
    const found = await this.findPlanOrFail(id);
    try {
      await retryOnDeadlock(() =>
        this.dataSource.transaction(async (manager) => {
          // venueId of a plan never changes
          await lockVenue(manager, found.venueId);
          const plan = await manager.findOne(ProPlan, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!plan) throw new ProException('PLAN_NOT_FOUND');
          const used = await manager.count(ProSubscription, {
            where: { planId: id },
          });
          if (used > 0) throw new ProException('PLAN_IN_USE');
          await manager.delete(ProPlan, { id });
        }),
      );
    } catch (err) {
      if (isRowReferenced(err)) throw new ProException('PLAN_IN_USE');
      throw err;
    }
    return { success: true };
  }

  // ── helpers ─────────────────────────────────────────────────────────

  private async getAdminVenue(id: string): Promise<AdminVenueView> {
    const venue = await this.findVenueOrFail(id);
    const plans = await this.plansRepository.find({
      where: { venueId: id },
      order: { sortOrder: 'ASC', rank: 'ASC', createdAt: 'ASC' },
    });
    return toAdminVenue(venue, plans.map(toAdminPlan));
  }

  private async getAdminPlan(id: string): Promise<AdminPlanView> {
    return toAdminPlan(await this.findPlanOrFail(id));
  }

  private async findVenueOrFail(id: string): Promise<ProVenue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) throw new ProException('VENUE_NOT_FOUND');
    return venue;
  }

  private async findPlanOrFail(id: string): Promise<ProPlan> {
    const plan = await this.plansRepository.findOne({ where: { id } });
    if (!plan) throw new ProException('PLAN_NOT_FOUND');
    return plan;
  }

  private async assertVenueKeyFree(key: string, exceptId?: string) {
    const taken = await this.venuesRepository.exists({
      where: exceptId ? { key, id: Not(exceptId) } : { key },
    });
    if (taken) throw new ProException('VENUE_KEY_TAKEN');
  }

  private async assertPlanCodeFree(
    venueId: string,
    code: string,
    exceptId?: string,
  ) {
    const taken = await this.plansRepository.exists({
      where: exceptId
        ? { venueId, code, id: Not(exceptId) }
        : { venueId, code },
    });
    if (taken) throw new ProException('PLAN_CODE_TAKEN');
  }
}

/**
 * Price rules on the values a plan will have: a free plan (rank 0) costs 0
 * and cannot be bought; a plan that can be bought costs more than 0.
 */
export function assertPlanPricing(
  rank: number,
  priceSatang: number,
  isPurchasable: boolean,
): void {
  if (rank === 0 && (priceSatang !== 0 || isPurchasable)) {
    throw new ProException('FREE_PLAN_PRICE');
  }
  if (isPurchasable && priceSatang <= 0) {
    throw new ProException('PURCHASABLE_NEEDS_PRICE');
  }
}

/**
 * Every rule on the values a plan will have: the price rules, and a free
 * plan (rank 0) never opens the Mock Exams that must be bought (its rights
 * apply to every user of the venue without a paid plan).
 */
export function assertPlanRules(
  rank: number,
  priceSatang: number,
  isPurchasable: boolean,
  entitlements: Pick<ProEntitlements, 'mockPurchase'>,
): void {
  assertPlanPricing(rank, priceSatang, isPurchasable);
  if (rank === 0 && entitlements.mockPurchase === true) {
    throw new ProException('FREE_PLAN_MOCK_PURCHASE');
  }
}

/** Lock the venue row for the transaction (404 when it is gone). */
async function lockVenue(manager: EntityManager, venueId: string) {
  const venue = await manager.findOne(ProVenue, {
    where: { id: venueId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!venue) throw new ProException('VENUE_NOT_FOUND');
}

/** 409 FREE_PLAN_EXISTS when another plan of the venue has rank 0. */
async function assertNoOtherFreePlan(
  manager: EntityManager,
  plan: Pick<ProPlan, 'venueId'> & { id?: string },
) {
  const others = await manager.count(ProPlan, {
    where: plan.id
      ? { venueId: plan.venueId, rank: 0, id: Not(plan.id) }
      : { venueId: plan.venueId, rank: 0 },
  });
  if (others > 0) throw new ProException('FREE_PLAN_EXISTS');
}

function toPageView(row: ProPage): ProPageView {
  return {
    title: row.title ?? '',
    subtitle: row.subtitle ?? null,
    venuePickerTitle: row.venuePickerTitle ?? null,
    footerNote: row.footerNote ?? null,
  };
}

function toPublicPlan(plan: ProPlan): PublicPlanView {
  return {
    id: plan.id,
    code: plan.code,
    rank: plan.rank,
    name: plan.name,
    tagline: plan.tagline ?? null,
    priceSatang: plan.priceSatang,
    priceUnit: plan.priceUnit ?? null,
    priceNote: plan.priceNote ?? null,
    buttonText: plan.buttonText,
    badge: plan.badge ?? null,
    highlight: bool(plan.highlight),
    isPurchasable: bool(plan.isPurchasable),
  };
}

function toAdminPlan(plan: ProPlan): AdminPlanView {
  return {
    ...toPublicPlan(plan),
    venueId: plan.venueId,
    periodDays: plan.periodDays,
    sortOrder: plan.sortOrder,
    isVisible: bool(plan.isVisible),
    entitlements: normalizeStoredEntitlements(plan.entitlements),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function toAdminVenue(venue: ProVenue, plans: AdminPlanView[]): AdminVenueView {
  return {
    id: venue.id,
    key: venue.key,
    name: venue.name,
    description: venue.description ?? null,
    sortOrder: venue.sortOrder,
    isActive: bool(venue.isActive),
    comparison: normalizeStoredComparison(venue.comparison),
    createdAt: venue.createdAt,
    updatedAt: venue.updatedAt,
    plans,
  };
}
