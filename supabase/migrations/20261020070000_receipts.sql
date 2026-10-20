-- Receipts: every finished job gets a numbered receipt, which its customer,
-- its technician and admins can open from the booking, the job and the admin
-- booking page, and print or save as a PDF. The number is given in order when
-- the job is marked done and never changes. What the receipt lists (the
-- inspection fee, the approved repairs, the first-booking offer and the total
-- paid in cash) comes from the booking itself.

create table public.receipts (
  booking_id uuid primary key references public.bookings (id) on delete restrict,
  number bigint generated always as identity unique,
  issued_at timestamptz not null default now()
);

alter table public.receipts enable row level security;

-- Read only: receipts are issued when a job is marked done (below).
revoke all on public.receipts from anon, authenticated;
grant all on public.receipts to service_role;
grant select on public.receipts to authenticated;

-- Whoever can see the booking (its customer, its technician, admins) sees its receipt.
create policy "People see the receipts of bookings they can see"
  on public.receipts for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

-- A job marked done (or added already done) gets the next number.
create function private.issue_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.receipts (booking_id, issued_at)
  values (new.id, coalesce(new.completed_at, now()))
  on conflict (booking_id) do nothing;
  return null;
end;
$$;
revoke execute on function private.issue_receipt() from public;

create trigger issue_receipt
  after update of status on public.bookings
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function private.issue_receipt();

create trigger issue_receipt_on_insert
  after insert on public.bookings
  for each row
  when (new.status = 'completed')
  execute function private.issue_receipt();

-- Jobs done before receipts existed, numbered in the order they were done.
insert into public.receipts (booking_id, issued_at)
select id, coalesce(completed_at, updated_at)
from public.bookings
where status = 'completed'
order by coalesce(completed_at, updated_at), id;
