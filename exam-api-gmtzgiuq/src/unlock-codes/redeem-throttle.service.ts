import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { UnlockCodeRedeemFailure } from './unlock-code-redeem-failure.entity';
import { RedeemException } from './unlock-code-format';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Brute-force limit: this many failed redeems per account in the window. */
export const REDEEM_MAX_FAILURES = 10;
export const REDEEM_FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Attempt rows older than this are deleted (whole table, hourly). */
const REDEEM_FAILURE_KEEP_MS = DAY_MS;
const REDEEM_PRUNE_EVERY_MS = 60 * 60 * 1000;
/** errorCode of an attempt still being checked (counts toward the limit). */
export const PENDING_ATTEMPT = 'PENDING';

/**
 * The limit on typing codes (task 15), shared by unlock codes and the
 * discount codes of the Pro checkout (task 19): one table, one count per
 * account, so guesses in either place add up.
 *
 * Atomic under concurrency: every attempt first writes a PENDING row, then
 * counts the account's rows in the last 15 minutes (its own included).
 * More than REDEEM_MAX_FAILURES → 429 TOO_MANY_ATTEMPTS (the row is
 * removed, so 429s do not extend the wait); otherwise the caller settles
 * the row: the failure's errorCode, or removed on success. Since each
 * request counts after its own insert, at most REDEEM_MAX_FAILURES attempts
 * per window get past the check however many run at once.
 */
@Injectable()
export class RedeemThrottleService {
  private readonly logger = new Logger(RedeemThrottleService.name);
  // Last whole-table prune of old attempt rows (per process; 0 = not yet)
  private lastPruneAt = 0;

  constructor(
    @InjectRepository(UnlockCodeRedeemFailure)
    private failuresRepository: Repository<UnlockCodeRedeemFailure>,
  ) {}

  /**
   * Start an attempt of `userId`: returns its id (settle it afterwards).
   * Over the limit → throws RedeemException TOO_MANY_ATTEMPTS (429).
   */
  async begin(userId: string, now: Date = new Date()): Promise<string> {
    const attemptId = randomUUID();
    await this.failuresRepository.insert({
      id: attemptId,
      userId,
      errorCode: PENDING_ATTEMPT,
      failedAt: now,
    });
    await this.pruneOldFailures(now);

    const inWindow = await this.failuresRepository.count({
      where: {
        userId,
        failedAt: MoreThan(new Date(now.getTime() - REDEEM_FAILURE_WINDOW_MS)),
      },
    });
    if (inWindow > REDEEM_MAX_FAILURES) {
      await this.settle(attemptId, null);
      throw new RedeemException('TOO_MANY_ATTEMPTS');
    }
    return attemptId;
  }

  /**
   * The attempt row becomes a failure (errorCode) or is removed (null).
   * Never hides the result of the attempt: a failed write is only logged.
   */
  async settle(id: string, errorCode: string | null): Promise<void> {
    try {
      if (errorCode) {
        await this.failuresRepository.update(id, {
          errorCode: errorCode.slice(0, 32),
        });
      } else {
        await this.failuresRepository.delete({ id });
      }
    } catch (err) {
      this.logger.error(
        `Could not update an unlock code redeem attempt: ${String(err)}`,
      );
    }
  }

  /**
   * At most once an hour per API process: delete attempt rows older than a
   * day of every account (the window is 15 minutes; the table stays small,
   * so a scan is cheap).
   */
  private async pruneOldFailures(now: Date) {
    if (now.getTime() - this.lastPruneAt < REDEEM_PRUNE_EVERY_MS) return;
    this.lastPruneAt = now.getTime();
    try {
      await this.failuresRepository.delete({
        failedAt: LessThan(new Date(now.getTime() - REDEEM_FAILURE_KEEP_MS)),
      });
    } catch (err) {
      this.logger.error(
        `Could not prune old unlock code redeem attempts: ${String(err)}`,
      );
    }
  }
}
