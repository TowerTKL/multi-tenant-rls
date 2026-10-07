import { appClient, db, ownerClient } from "../db/client.js";
import { products } from "../db/schema.js";
import { withTenant } from "../db/tenant.js";

// Same query, three contexts. Run `pnpm db:seed` first.
const owner = ownerClient();
const accounts = await owner<{ id: string; name: string }[]>`select id, name from accounts order by name`;
await owner.end();

for (const account of accounts) {
  const rows = await withTenant(account.id, (tx) => tx.select({ name: products.name }).from(products));
  console.log(`${account.name.padEnd(14)} sees: ${rows.map((r) => r.name).join(", ")}`);
}

const outside = await db.select().from(products);
console.log(`${"no tenant".padEnd(14)} sees: ${outside.length} rows`);

await appClient.end();
