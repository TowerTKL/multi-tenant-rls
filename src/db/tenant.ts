import { sql } from "drizzle-orm";
import { db, type Tx } from "./client.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` inside a transaction scoped to one tenant.
 *
 * set_config(..., true) is transaction-local: the setting disappears on commit or rollback,
 * so a pooled connection can never carry one tenant's id into the next request.
 * Outside withTenant() the setting is empty and every policy matches zero rows.
 */
export async function withTenant<T>(accountId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(accountId)) throw new Error("withTenant: accountId must be a UUID");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.account_id', ${accountId}, true)`);
    return fn(tx);
  });
}
