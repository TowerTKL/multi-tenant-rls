import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ownerClient } from "../db/client.js";

// Tiny forward-only runner: applies migrations/*.sql in order, once each.
const dir = join(import.meta.dirname, "../../migrations");
const sql = ownerClient();

try {
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into _migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("migrations up to date");
} finally {
  await sql.end();
}
