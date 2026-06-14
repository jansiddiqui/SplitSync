-- ========================================================
-- SPLITSYNC DATABASE MIGRATION - PHASE 2 (DATA INTEGRITY)
-- Run these queries in your Supabase SQL Editor
-- ========================================================

-- 1. Soft Delete Schema Support
-- Adds deleted_at to Expense and Settlement tables
alter table public."Expense" 
add column deleted_at timestamp with time zone;

alter table public."Settlement" 
add column deleted_at timestamp with time zone;

-- 2. Database Constraints for Financial Sanitization
-- Ensure amounts are always non-negative
alter table public."Expense"
add constraint expense_amount_non_negative check (amount >= 0);

alter table public."Settlement"
add constraint settlement_amount_non_negative check (amount >= 0);

-- Ensure exchange rates are strictly positive
alter table public."Expense"
add constraint expense_exchange_rate_positive check (exchange_rate > 0);

alter table public."Settlement"
add constraint settlement_exchange_rate_positive check (exchange_rate > 0);

-- 3. Database Indexes for Query Optimization
create index ifp_expense_group_id on public."Expense" (group_id);
create index ifp_settlement_group_id on public."Settlement" (group_id);
create index ifp_expense_split_expense_id on public."ExpenseSplit" (expense_id);
create index ifp_expense_split_user_id on public."ExpenseSplit" (user_id);
create index ifp_group_member_group_id on public."GroupMember" (group_id);
create index ifp_group_member_user_id on public."GroupMember" (user_id);

-- 4. Audit Logging Architecture
-- Create the central AuditLog table
create table public."AuditLog" (
  id uuid default gen_random_uuid() primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null, -- 'INSERT', 'UPDATE', 'DELETE'
  old_data jsonb,
  new_data jsonb,
  performed_by uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Trigger function to log audit entries automatically
create or replace function public.process_audit_log()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    insert into public."AuditLog" (table_name, record_id, action, new_data, performed_by)
    values (TG_TABLE_NAME, coalesce(new.id, null), TG_OP, row_to_json(new)::jsonb, auth.uid());
    return new;
  elsif (TG_OP = 'UPDATE') then
    insert into public."AuditLog" (table_name, record_id, action, old_data, new_data, performed_by)
    values (TG_TABLE_NAME, coalesce(new.id, old.id, null), TG_OP, row_to_json(old)::jsonb, row_to_json(new)::jsonb, auth.uid());
    return new;
  elsif (TG_OP = 'DELETE') then
    insert into public."AuditLog" (table_name, record_id, action, old_data, performed_by)
    values (TG_TABLE_NAME, coalesce(old.id, null), TG_OP, row_to_json(old)::jsonb, auth.uid());
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

-- Apply audit triggers to core tables
create trigger audit_expense_trigger
after insert or update or delete on public."Expense"
for each row execute function public.process_audit_log();

create trigger audit_settlement_trigger
after insert or update or delete on public."Settlement"
for each row execute function public.process_audit_log();

-- 5. Row Level Security (RLS) Policies
-- Enable RLS on all tables
alter table public."Group" enable row level security;
alter table public."GroupMember" enable row level security;
alter table public."Expense" enable row level security;
alter table public."ExpenseSplit" enable row level security;
alter table public."Settlement" enable row level security;
alter table public."ImportJob" enable row level security;
alter table public."AnomalyLog" enable row level security;
alter table public."ImportReport" enable row level security;
alter table public."AuditLog" enable row level security;

-- Helper security function to verify group membership
create or replace function public.is_group_member(group_id uuid, user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 
    from public."GroupMember" 
    where public."GroupMember".group_id = is_group_member.group_id 
      and public."GroupMember".user_id = is_group_member.user_id
  );
end;
$$ language plpgsql security definer;

-- Policies for public."Group"
create policy "Users can read groups they are members of" on public."Group"
  for select using (public.is_group_member(id, auth.uid()));

create policy "Users can update groups they created" on public."Group"
  for update using (created_by = auth.uid());

-- Policies for public."GroupMember"
create policy "Members can read group membership rosters" on public."GroupMember"
  for select using (public.is_group_member(group_id, auth.uid()) or user_id = auth.uid());

create policy "Group creators can manage members" on public."GroupMember"
  for all using (
    exists (
      select 1 from public."Group" 
      where id = group_id and created_by = auth.uid()
    )
  );

-- Policies for public."Expense"
create policy "Members can read group expenses" on public."Expense"
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "Members can insert group expenses" on public."Expense"
  for insert with check (public.is_group_member(group_id, auth.uid()));

create policy "Payer can modify their expenses" on public."Expense"
  for update using (paid_by = auth.uid());

-- Policies for public."ExpenseSplit"
create policy "Members can read splits of group expenses" on public."ExpenseSplit"
  for select using (
    exists (
      select 1 from public."Expense"
      where id = expense_id and public.is_group_member(group_id, auth.uid())
    )
  );

create policy "Members can insert splits" on public."ExpenseSplit"
  for insert with check (
    exists (
      select 1 from public."Expense"
      where id = expense_id and public.is_group_member(group_id, auth.uid())
    )
  );

-- Policies for public."Settlement"
create policy "Members can read settlements" on public."Settlement"
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "Members can insert settlements" on public."Settlement"
  for insert with check (public.is_group_member(group_id, auth.uid()));

create policy "Payer can delete or update their settlements" on public."Settlement"
  for update using (payer_id = auth.uid());

-- Policies for CSV Staging tables
create policy "Members can read import jobs" on public."ImportJob"
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "Importer can manage their import jobs" on public."ImportJob"
  for all using (imported_by = auth.uid());

create policy "Members can read anomaly logs" on public."AnomalyLog"
  for select using (
    exists (
      select 1 from public."ImportJob"
      where id = import_job_id and public.is_group_member(group_id, auth.uid())
    )
  );

create policy "Importer can manage anomaly logs" on public."AnomalyLog"
  for all using (
    exists (
      select 1 from public."ImportJob"
      where id = import_job_id and imported_by = auth.uid()
    )
  );

create policy "Members can read reports" on public."ImportReport"
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "Importer can insert reports" on public."ImportReport"
  for insert with check (
    exists (
      select 1 from public."ImportJob"
      where id = import_job_id and imported_by = auth.uid()
    )
  );

-- 6. Supabase Database Transactions (RPC)
-- Atomic function to insert an expense and its splits in a single transaction
create or replace function public.create_expense_with_splits(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_amount numeric,
  p_paid_by uuid,
  p_currency_code text,
  p_exchange_rate numeric,
  p_splits jsonb
)
returns uuid as $$
declare
  v_expense_id uuid;
  v_split jsonb;
begin
  -- Insert the parent expense
  insert into public."Expense" (group_id, title, description, amount, paid_by, currency_code, exchange_rate)
  values (p_group_id, p_title, p_description, p_amount, p_paid_by, p_currency_code, p_exchange_rate)
  returning id into v_expense_id;

  -- Loop and insert each split
  for v_split in select * from jsonb_array_elements(p_splits)
  loop
    insert into public."ExpenseSplit" (expense_id, user_id, amount, percentage, share_count, split_type)
    values (
      v_expense_id, 
      (v_split->>'user_id')::uuid, 
      (v_split->>'amount')::numeric,
      (v_split->>'percentage')::numeric,
      (v_split->>'share_count')::numeric,
      v_split->>'split_type'
    );
  end loop;

  return v_expense_id;
end;
$$ language plpgsql security definer;
