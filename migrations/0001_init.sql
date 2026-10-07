-- Tenant-scoped schema with row-level security.
-- Runs as the database owner. The application connects as `app_user`,
-- which is NOT the table owner and has no BYPASSRLS, so policies always apply.

create extension if not exists pgcrypto;

-- Login role used by the app at runtime. The password here is for local dev and CI only.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_user' nobypassrls;
  end if;
end
$$;

-- The current tenant lives in a transaction-local setting (see src/db/tenant.ts).
-- nullif(...) matters: once a custom setting has been used on a connection it reads back
-- as '' instead of NULL, and ''::uuid would raise instead of simply matching nothing.
create or replace function current_account_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.account_id', true), '')::uuid $$;

create table accounts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table stores (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  -- lets child tables reference (account_id, id) so a row can never point at another tenant's store
  unique (account_id, id)
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  store_id    uuid not null,
  name        text not null,
  price_cents integer not null check (price_cents >= 0),
  foreign key (account_id, store_id) references stores (account_id, id) on delete cascade
);

create table orders (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  store_id    uuid not null,
  total_cents integer not null check (total_cents >= 0),
  created_at  timestamptz not null default now(),
  foreign key (account_id, store_id) references stores (account_id, id) on delete cascade
);

create index on stores (account_id);
create index on products (account_id, store_id);
create index on orders (account_id, store_id, created_at);

-- Row-level security -------------------------------------------------------

alter table accounts enable row level security;
alter table accounts force row level security;
create policy tenant_isolation on accounts
  using (id = current_account_id())
  with check (id = current_account_id());

alter table stores enable row level security;
alter table stores force row level security;
create policy tenant_isolation on stores
  using (account_id = current_account_id())
  with check (account_id = current_account_id());

alter table products enable row level security;
alter table products force row level security;
create policy tenant_isolation on products
  using (account_id = current_account_id())
  with check (account_id = current_account_id());

alter table orders enable row level security;
alter table orders force row level security;
create policy tenant_isolation on orders
  using (account_id = current_account_id())
  with check (account_id = current_account_id());

-- Privileges for the runtime role -----------------------------------------

grant usage on schema public to app_user;
grant select, insert, update, delete on accounts, stores, products, orders to app_user;
grant execute on function current_account_id() to app_user;
