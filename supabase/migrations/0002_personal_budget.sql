-- Personal budgets: each person on a trip has their own target. Their
-- "remaining" is budget minus their own share of expenses (shared costs split
-- to them + personal expenses), so two friends can see different numbers.

alter table public.participants
  add column if not exists budget numeric(14,2) not null default 0 check (budget >= 0);

-- Carry over any existing trip-wide budget to the person who created the trip.
update public.participants p
   set budget = t.budget
  from public.trips t
 where p.trip_id = t.id
   and p.user_id = t.created_by
   and p.budget = 0
   and t.budget > 0;
