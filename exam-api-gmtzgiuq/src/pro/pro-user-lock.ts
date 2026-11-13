import { DataSource, EntityManager } from 'typeorm';
import { ProException, isDeadlock, isLockWaitTimeout } from './pro-errors';

/** Tries of one locked write when InnoDB picks it as a deadlock victim. */
export const MAX_LOCKED_TRIES = 3;

/** innodb_lock_wait_timeout (seconds) while holding the user's lock. */
export const LOCK_WAIT_TIMEOUT_SEC = 5;

/**
 * Run `work` in a transaction that first locks the user's row
 * (SELECT ... FOR UPDATE), like the answer log (task 16): writers of the
 * same user's Pro rights (two admin grants at once, later a payment
 * webhook) run one after the other, so the "one active subscription per
 * venue" rule holds.
 *
 * Lock order of every Pro write: users → pro_venues → pro_plans (grant:
 * user X, venue S, plan S; plan create/update/delete and venue delete:
 * venue X, then plan X). Taking them in this order everywhere avoids
 * deadlocks between grants and admin edits; retryOnDeadlock is the backstop. Reads inside `work` that come after the lock see what
 * the previous writer committed (InnoDB creates the read view at the first
 * non-locking read, after the lock is granted).
 *
 * Lock waits are bounded (5 s on this connection, restored before it goes
 * back to the pool): still waiting → 409 USER_BUSY. User row missing →
 * 404 USER_NOT_FOUND. A deadlock victim (1213) is retried; still a victim
 * after MAX_LOCKED_TRIES → 409 USER_BUSY (not a 500).
 */
export async function withUserLock<T>(
  dataSource: DataSource,
  userId: string,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await dataSource.transaction(async (manager) => {
        const restoreLockTimeout = await shortLockTimeout(manager);
        try {
          let rows: unknown;
          try {
            rows = await manager.query(
              'SELECT id FROM users WHERE id = ? FOR UPDATE',
              [userId],
            );
          } catch (err) {
            if (isLockWaitTimeout(err)) throw new ProException('USER_BUSY');
            throw err;
          }
          if (!Array.isArray(rows) || rows.length === 0) {
            throw new ProException('USER_NOT_FOUND');
          }
          return await work(manager);
        } finally {
          await restoreLockTimeout();
        }
      });
    } catch (err) {
      if (!isDeadlock(err)) throw err;
      if (attempt >= MAX_LOCKED_TRIES) throw new ProException('USER_BUSY');
    }
  }
}

/**
 * Backstop for the admin writes of venues/plans: a deadlock victim (1213)
 * is run again (MAX_LOCKED_TRIES in all); still a victim, or a lock wait
 * that ran out (1205) → 409 CONCURRENT_UPDATE with a Thai message instead
 * of a 500. Other errors pass through.
 */
export async function retryOnDeadlock<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (err) {
      if (isDeadlock(err)) {
        if (attempt < MAX_LOCKED_TRIES) continue;
        throw new ProException('CONCURRENT_UPDATE');
      }
      if (isLockWaitTimeout(err)) {
        throw new ProException('CONCURRENT_UPDATE');
      }
      throw err;
    }
  }
}

/**
 * Lowers innodb_lock_wait_timeout on the transaction's own connection and
 * returns a function that puts the previous value back.
 */
async function shortLockTimeout(
  manager: EntityManager,
): Promise<() => Promise<void>> {
  try {
    const rows: unknown = await manager.query(
      'SELECT @@SESSION.innodb_lock_wait_timeout AS t',
    );
    const previous = Number(
      Array.isArray(rows) ? (rows[0] as { t?: unknown })?.t : undefined,
    );
    await manager.query(
      `SET SESSION innodb_lock_wait_timeout = ${LOCK_WAIT_TIMEOUT_SEC}`,
    );
    const restoreTo =
      Number.isInteger(previous) && previous > 0 ? previous : 50;
    return async () => {
      await manager
        .query('SET SESSION innodb_lock_wait_timeout = ?', [restoreTo])
        .catch(() => {});
    };
  } catch {
    return () => Promise.resolve();
  }
}
