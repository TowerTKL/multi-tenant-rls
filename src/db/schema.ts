import { foreignKey, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// Mirrors migrations/0001_init.sql so queries are fully typed.
// Isolation itself is enforced by the RLS policies in that migration, not by this file.

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.accountId, t.id)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull(),
    storeId: uuid("store_id").notNull(),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
  },
  (t) => [foreignKey({ columns: [t.accountId, t.storeId], foreignColumns: [stores.accountId, stores.id] })],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull(),
    storeId: uuid("store_id").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [foreignKey({ columns: [t.accountId, t.storeId], foreignColumns: [stores.accountId, stores.id] })],
);
