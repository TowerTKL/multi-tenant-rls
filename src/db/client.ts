import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env or export it.`);
  return value;
}

// Runtime connection: logs in as app_user, so every query goes through RLS.
export const appClient = postgres(env("DATABASE_URL"), { max: Number(process.env.DB_POOL_MAX ?? 10) });
export const db = drizzle(appClient, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Owner connection: only for migrations, seeding and tests. Never used to serve requests.
export function ownerClient() {
  return postgres(env("DATABASE_URL_OWNER"), { max: 1, onnotice: () => {} });
}
