/*
# SocialX Core Schema: Profiles, Follows, and Auth Trigger

## Overview
Creates the foundational tables for the SocialX social media app:
- `profiles` table extending Supabase auth.users with public profile data
- `follows` table for user follow relationships
- A database trigger that automatically creates a profile when a new user signs up

## New Tables

### profiles
- `id` (uuid, PK) — references auth.users(id), CASCADE on delete
- `username` (text, UNIQUE, NOT NULL) — the user's handle, lowercased
- `display_name` (text) — display name shown on profile
- `bio` (text) — user biography
- `avatar_url` (text) — profile photo URL (Supabase Storage)
- `created_at` (timestamptz) — account creation time
- `updated_at` (timestamptz) — last profile update

### follows
- `id` (uuid, PK)
- `follower_id` (uuid, NOT NULL) — the user who follows
- `following_id` (uuid, NOT NULL) — the user being followed
- `created_at` (timestamptz)
- UNIQUE constraint on (follower_id, following_id) to prevent duplicate follows

## Security
- RLS enabled on both tables
- profiles: any authenticated user can read all profiles; users can only update their own
- follows: any authenticated user can read all follows; users can only create/delete their own follows
- A trigger `on_auth_user_created` fires after INSERT on auth.users, creating a profile row using the username from `raw_user_meta_data`

## Important Notes
1. The frontend uses username+password auth. The email is generated as `{username}@socialx.app`.
2. The username is passed via `options.data: { username }` during signUp, which lands in `raw_user_meta_data`.
3. The trigger extracts the username and creates the profile automatically.
*/

-- ============ PROFILES TABLE ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  bio text DEFAULT '',
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all"
ON profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============ FOLLOWS TABLE ============
CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_all" ON follows;
CREATE POLICY "follows_select_all"
ON follows FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "follows_insert_own" ON follows;
CREATE POLICY "follows_insert_own"
ON follows FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_delete_own" ON follows;
CREATE POLICY "follows_delete_own"
ON follows FOR DELETE
TO authenticated
USING (auth.uid() = follower_id);

-- ============ AUTH USER CREATED TRIGGER ============
-- Creates a profile row automatically when a new auth user signs up.
-- The username comes from raw_user_meta_data which is set via signUp options.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    lower(NEW.raw_user_meta_data->>'username'),
    NEW.raw_user_meta_data->>'username'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles(lower(username));
