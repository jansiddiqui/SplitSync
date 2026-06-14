-- ==========================================
-- SPLITSYNC DATABASE MIGRATION - PHASE 1 & 2
-- Run these queries in your Supabase SQL Editor
-- ==========================================

-- 1. Support for Membership Timelines
-- Adds left_at column to GroupMember to track active membership bounds
alter table public."GroupMember" 
add column left_at timestamp with time zone;

-- 2. Support for Multi-Currency
-- Adds base_currency to Groups and currency tracking to Expenses & Settlements
alter table public."Group"
add column base_currency varchar(3) default 'INR' not null;

alter table public."Expense"
add column currency_code varchar(3) default 'INR' not null,
add column exchange_rate numeric(12, 6) default 1.000000 not null;

alter table public."Settlement"
add column currency_code varchar(3) default 'INR' not null,
add column exchange_rate numeric(12, 6) default 1.000000 not null;

-- 3. CSV Import Staging Tables
-- ImportJob tracks a CSV import session
create table public."ImportJob" (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public."Group" on delete cascade not null,
  imported_by uuid references public."User" on delete cascade not null,
  filename text not null,
  status text default 'pending' not null, -- 'pending', 'completed'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- AnomalyLog tracks flagged items and their resolution policies
create table public."AnomalyLog" (
  id uuid default gen_random_uuid() primary key,
  import_job_id uuid references public."ImportJob" on delete cascade not null,
  row_index integer not null,
  anomaly_type text not null, -- e.g. 'duplicate', 'missing_payer', 'currency_mismatch'
  description text not null,
  status text default 'pending_review' not null, -- 'pending_review', 'ignored', 'resolved', 'discarded'
  resolution_details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ImportReport stores aggregate stats for completed import runs
create table public."ImportReport" (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public."Group" on delete cascade not null,
  import_job_id uuid references public."ImportJob" on delete cascade not null,
  total_rows integer not null,
  imported_count integer not null,
  anomaly_count integer not null,
  total_amount_base numeric(12,2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
