-- ===================================================
-- Phase 3 Migration: Unregistered Member Tracking
-- ===================================================
-- Run this in Supabase SQL Editor

-- Drop the foreign key constraint on User table to allow placeholder users
ALTER TABLE public."User" DROP CONSTRAINT IF EXISTS "User_id_fkey";

-- Table to track users who appear in CSV imports but haven't registered yet
CREATE TABLE IF NOT EXISTS "UnregisteredMember" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,                          -- Name as it appeared in CSV
  placeholder_user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,  -- auto-created placeholder
  real_email TEXT,                                     -- email if provided by admin
  invited_by UUID REFERENCES "User"(id),
  invite_sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'               -- 'pending' | 'invited' | 'joined'
    CHECK (status IN ('pending', 'invited', 'joined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by group
CREATE INDEX IF NOT EXISTS idx_unregistered_member_group ON "UnregisteredMember"(group_id);
-- Index to find by placeholder user id (used during merge on real signup)
CREATE INDEX IF NOT EXISTS idx_unregistered_member_placeholder ON "UnregisteredMember"(placeholder_user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_unregistered_member_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unregistered_member_updated ON "UnregisteredMember";
CREATE TRIGGER trg_unregistered_member_updated
  BEFORE UPDATE ON "UnregisteredMember"
  FOR EACH ROW EXECUTE FUNCTION update_unregistered_member_timestamp();

-- Enable Row-Level Security
ALTER TABLE "UnregisteredMember" ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their group's unregistered members
CREATE POLICY "read_unregistered_members" ON "UnregisteredMember"
  FOR SELECT TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM "GroupMember" WHERE user_id = auth.uid()
    )
  );

-- Allow authenticated users to insert unregistered members for their groups
CREATE POLICY "insert_unregistered_members" ON "UnregisteredMember"
  FOR INSERT TO authenticated
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM "GroupMember" WHERE user_id = auth.uid()
    )
  );

-- Allow update (mark as invited/joined, set real_email)
CREATE POLICY "update_unregistered_members" ON "UnregisteredMember"
  FOR UPDATE TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM "GroupMember" WHERE user_id = auth.uid()
    )
  );
