import { ownerClient } from "../db/client.js";

// Two pizzerias with one store each. Runs as the owner, which bypasses RLS on purpose.
const sql = ownerClient();

try {
  await sql`truncate accounts cascade`;
  const tenants = [
    { name: "Forno & Lenha", store: "Centro", items: [["Margherita", 4900], ["Calabresa", 4500]] },
    { name: "Bella Massa", store: "Vila Nova", items: [["Portuguesa", 5200], ["Quatro Queijos", 5600]] },
  ] as const;

  for (const t of tenants) {
    const [account] = await sql`insert into accounts (name) values (${t.name}) returning id`;
    const [store] = await sql`insert into stores (account_id, name) values (${account.id}, ${t.store}) returning id`;
    for (const [name, price] of t.items) {
      await sql`insert into products (account_id, store_id, name, price_cents) values (${account.id}, ${store.id}, ${name}, ${price})`;
    }
    console.log(`${t.name}: ${account.id}`);
  }
} finally {
  await sql.end();
}
