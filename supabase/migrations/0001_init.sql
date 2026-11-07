-- TripSplit schema: trips, people on each trip, expenses, settle-up payments,
-- private receipt photos. Row Level Security makes every row visible only to
-- members of that trip.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers

create or replace function public.gen_share_code() returns text
language plpgsql volatile as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.trips where share_code = code);
  end loop;
  return code;
end $$;

-- ---------------------------------------------------------------- tables

create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  destination   text,
  emoji         text not null default '✈️',
  start_date    date,
  end_date      date,
  base_currency text not null default 'MYR' check (base_currency ~ '^[A-Z]{3}$'),
  budget        numeric(14,2) not null default 0 check (budget >= 0),
  share_code    text not null unique,
  is_archived   boolean not null default false,
  notes         text,
  created_by    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at    timestamptz not null default now()
);

create table public.participants (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  user_id    uuid references auth.users on delete set null,
  email      text,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id),
  unique (id, trip_id)
);
create index on public.participants (user_id);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  category      text not null default 'other'
                check (category in ('food','transport','stay','tickets','shopping','other')),
  date          date not null default current_date,
  amount        numeric(14,2) not null check (amount > 0),
  currency      text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  amount_base   numeric(14,2) not null check (amount_base >= 0),
  paid_by       uuid not null,
  split_type    text not null default 'equal' check (split_type in ('equal','custom')),
  split_among   uuid[] not null default '{}',
  custom_shares jsonb not null default '[]',
  receipt_path  text,
  notes         text,
  created_by    uuid default auth.uid() references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- payer must be a person on the same trip
  foreign key (paid_by, trip_id) references public.participants (id, trip_id)
);
create index on public.expenses (trip_id, date desc);

create table public.settlements (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips on delete cascade,
  from_participant uuid not null,
  to_participant   uuid not null,
  amount_base      numeric(14,2) not null check (amount_base > 0),
  date             date not null default current_date,
  notes            text,
  created_by       uuid default auth.uid() references auth.users on delete set null,
  created_at       timestamptz not null default now(),
  check (from_participant <> to_participant),
  foreign key (from_participant, trip_id) references public.participants (id, trip_id),
  foreign key (to_participant, trip_id)   references public.participants (id, trip_id)
);
create index on public.settlements (trip_id);

-- ---------------------------------------------------------------- triggers

create or replace function public.trips_before_insert() returns trigger
language plpgsql as $$
begin
  new.share_code := public.gen_share_code();
  new.created_by := auth.uid();
  return new;
end $$;
create trigger trips_before_insert before insert on public.trips
  for each row execute function public.trips_before_insert();

-- Nobody can change who created a trip or its invite code by hand.
create or replace function public.trips_before_update() returns trigger
language plpgsql as $$
begin
  new.created_by := old.created_by;
  new.share_code := old.share_code;
  return new;
end $$;
create trigger trips_before_update before update on public.trips
  for each row execute function public.trips_before_update();

-- A person can only be linked to an account by that account itself
-- (claiming happens through join_trip). Members may still rename people.
create or replace function public.participants_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null and new.user_id is distinct from auth.uid() then
      raise exception 'cannot link another user';
    end if;
  elsif new.user_id is distinct from old.user_id then
    if not (old.user_id is null and new.user_id = auth.uid())
       and not (new.user_id is null and old.user_id = auth.uid()) then
      raise exception 'cannot relink another user';
    end if;
  end if;
  if new.user_id is not null then
    new.email := coalesce(new.email, auth.jwt() ->> 'email');
  end if;
  return new;
end $$;
create trigger participants_guard before insert or update on public.participants
  for each row execute function public.participants_guard();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- access

create or replace function public.is_trip_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips where id = t and created_by = auth.uid())
      or exists (select 1 from participants where trip_id = t and user_id = auth.uid());
$$;

alter table public.trips        enable row level security;
alter table public.participants enable row level security;
alter table public.expenses     enable row level security;
alter table public.settlements  enable row level security;

-- created_by is checked directly so INSERT ... RETURNING works in one statement.
create policy trips_select on public.trips for select to authenticated
  using (created_by = auth.uid() or public.is_trip_member(id));
create policy trips_insert on public.trips for insert to authenticated
  with check (true); -- created_by is forced to auth.uid() by trigger
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_member(id));
create policy trips_delete on public.trips for delete to authenticated
  using (created_by = auth.uid());

create policy participants_all on public.participants for all to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy expenses_all on public.expenses for all to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy settlements_all on public.settlements for all to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- ---------------------------------------------------------------- joining

-- What a not-yet-member sees after opening an invite link.
create or replace function public.trip_preview(code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  t trips;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into t from trips where share_code = upper(trim(code));
  if not found then return null; end if;
  return json_build_object(
    'id', t.id, 'name', t.name, 'emoji', t.emoji, 'destination', t.destination,
    'is_member', is_trip_member(t.id),
    'participants', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name, 'claimed', p.user_id is not null)
                      order by p.created_at)
      from participants p where p.trip_id = t.id), '[]'::json)
  );
end $$;

-- Join with an invite code: claim an existing unlinked name, or add yourself.
create or replace function public.join_trip(code text, claim_participant uuid default null,
                                            display_name text default null) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  t trips;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into t from trips where share_code = upper(trim(code));
  if not found then raise exception 'invalid code'; end if;
  if is_trip_member(t.id) then return t.id; end if;

  if claim_participant is not null then
    update participants set user_id = auth.uid(), email = auth.jwt() ->> 'email'
     where id = claim_participant and trip_id = t.id and user_id is null;
    if found then return t.id; end if;
  end if;

  if coalesce(trim(display_name), '') = '' then raise exception 'name required'; end if;
  insert into participants (trip_id, name, user_id, email)
  values (t.id, trim(display_name), auth.uid(), auth.jwt() ->> 'email');
  return t.id;
end $$;

revoke all on function public.trip_preview(text) from public, anon;
revoke all on function public.join_trip(text, uuid, text) from public, anon;
revoke all on function public.is_trip_member(uuid) from public, anon;
grant execute on function public.trip_preview(text) to authenticated;
grant execute on function public.join_trip(text, uuid, text) to authenticated;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- ---------------------------------------------------------------- receipts

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Path layout: receipts/<trip_id>/<file>.jpg
create or replace function public.receipt_trip_member(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return is_trip_member(split_part(object_name, '/', 1)::uuid);
exception when invalid_text_representation then
  return false;
end $$;
grant execute on function public.receipt_trip_member(text) to authenticated;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.receipt_trip_member(name));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.receipt_trip_member(name));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.receipt_trip_member(name));

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table public.trips, public.participants,
  public.expenses, public.settlements;
