import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appClient, db, ownerClient } from "../src/db/client.js";
import { orders, products, stores } from "../src/db/schema.js";
import { withTenant } from "../src/db/tenant.js";

// The pool is capped at one connection in vitest.config.ts, so every query below
// reuses the same physical connection. That is what makes the "no leak" test meaningful.

const owner = ownerClient();
let a: { account: string; store: string; product: string };
let b: { account: string; store: string; product: string };

async function createTenant(name: string) {
  const [account] = await owner`insert into accounts (name) values (${name}) returning id`;
  const [store] = await owner`insert into stores (account_id, name) values (${account.id}, 'Main') returning id`;
  const [product] = await owner`
    insert into products (account_id, store_id, name, price_cents)
    values (${account.id}, ${store.id}, ${name + " pizza"}, 4500) returning id`;
  return { account: account.id as string, store: store.id as string, product: product.id as string };
}

beforeAll(async () => {
  await owner`truncate accounts cascade`;
  a = await createTenant("Tenant A");
  b = await createTenant("Tenant B");
});

afterAll(async () => {
  await owner.end();
  await appClient.end();
});

describe("reads", () => {
  it("a tenant only sees its own rows", async () => {
    const rows = await withTenant(a.account, (tx) => tx.select().from(products));
    expect(rows.map((r) => r.id)).toEqual([a.product]);
  });

  it("asking for another tenant's row by id returns nothing", async () => {
    const rows = await withTenant(a.account, (tx) => tx.select().from(products).where(eq(products.id, b.product)));
    expect(rows).toHaveLength(0);
  });

  it("outside withTenant() every table looks empty", async () => {
    expect(await db.select().from(stores)).toHaveLength(0);
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("the tenant setting does not leak to the next query on the same connection", async () => {
    await withTenant(a.account, (tx) => tx.select().from(products));
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("concurrent tenants each get their own data", async () => {
    const [ra, rb] = await Promise.all([
      withTenant(a.account, (tx) => tx.select().from(products)),
      withTenant(b.account, (tx) => tx.select().from(products)),
    ]);
    expect(ra.map((r) => r.id)).toEqual([a.product]);
    expect(rb.map((r) => r.id)).toEqual([b.product]);
  });
});

describe("writes", () => {
  it("updating another tenant's row silently affects zero rows", async () => {
    const updated = await withTenant(a.account, (tx) =>
      tx.update(products).set({ priceCents: 1 }).where(eq(products.id, b.product)).returning(),
    );
    expect(updated).toHaveLength(0);

    const [row] = await owner`select price_cents from products where id = ${b.product}`;
    expect(row.price_cents).toBe(4500);
  });

  it("deleting another tenant's row affects zero rows", async () => {
    const deleted = await withTenant(a.account, (tx) =>
      tx.delete(products).where(eq(products.id, b.product)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });

  it("inserting a row stamped with another tenant's id is rejected by the policy", async () => {
    await expect(
      withTenant(a.account, (tx) => tx.insert(stores).values({ accountId: b.account, name: "Sneaky" })),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("a row cannot point at another tenant's store, even with its own account id", async () => {
    await expect(
      withTenant(a.account, (tx) =>
        tx.insert(orders).values({ accountId: a.account, storeId: b.store, totalCents: 4500 }),
      ),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("a normal write inside the tenant works", async () => {
    const [order] = await withTenant(a.account, (tx) =>
      tx.insert(orders).values({ accountId: a.account, storeId: a.store, totalCents: 9000 }).returning(),
    );
    expect(order.totalCents).toBe(9000);
  });
});

describe("guard rails", () => {
  it("rejects a malformed tenant id before touching the database", async () => {
    await expect(withTenant("'; drop table stores; --", async () => null)).rejects.toThrow(/must be a UUID/);
  });
});
