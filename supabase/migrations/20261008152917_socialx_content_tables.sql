/*
# SocialX Content Tables: Posts, Reels, Stories

## Overview
Creates the core content tables for the social media app.

## New Tables

### posts
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid()) — author
- `caption` (text) — post caption
- `media_urls` (text[]) — array of media URLs (photos/videos) from Supabase Storage
- `media_type` (text, default 'image') — 'image' or 'video'
- `created_at`, `updated_at` (timestamptz)
- `is_repost` (boolean, default false) — marks this as a repost
- `original_post_id` (uuid, nullable) — references original post if repost
- `original_user_id` (uuid, nullable) — original author
- `quote` (text, nullable) — optional quote/comment when reposting

### reels
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid()) — author
- `caption` (text)
- `video_url` (text, NOT NULL) — video URL from Supabase Storage
- `thumbnail_url` (text) — optional thumbnail
- `audio_title` (text) — optional audio/music title
- `created_at`, `updated_at` (timestamptz)
- `is_repost` (boolean, default false)
- `original_reel_id` (uuid, nullable)
- `original_user_id` (uuid, nullable)

### stories
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid())
- `media_url` (text, NOT NULL) — photo or video URL
- `media_type` (text, default 'image')
- `caption` (text) — optional caption/reply text
- `created_at` (timestamptz) — used for expiry (24h lifetime)
- `expires_at` (timestamptz) — calculated: created_at + 24 hours

## Security
- RLS enabled on all tables
- SELECT: all authenticated users can see all content (public social feed)
- INSERT: users can only create their own content
- UPDATE: users can only update their own content
- DELETE: users can only delete their own content

## Notes
1. Reposts are stored as separate rows referencing the original content.
2. Stories expire after 24 hours — a view or app logic filters by expires_at.
3. Media is stored in Supabase Storage buckets.
*/

-- ============ POSTS TABLE ============
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  caption text DEFAULT '',
  media_urls text[] DEFAULT '{}',
  media_type text DEFAULT 'image',
  is_repost boolean DEFAULT false,
  original_post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  original_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  quote text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_all" ON posts;
CREATE POLICY "posts_select_all"
ON posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON posts;
CREATE POLICY "posts_insert_own"
ON posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_update_own" ON posts;
CREATE POLICY "posts_update_own"
ON posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_delete_own" ON posts;
CREATE POLICY "posts_delete_own"
ON posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ REELS TABLE ============
CREATE TABLE IF NOT EXISTS reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  caption text DEFAULT '',
  video_url text NOT NULL,
  thumbnail_url text,
  audio_title text,
  is_repost boolean DEFAULT false,
  original_reel_id uuid REFERENCES reels(id) ON DELETE SET NULL,
  original_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE reels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reels_select_all" ON reels;
CREATE POLICY "reels_select_all"
ON reels FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reels_insert_own" ON reels;
CREATE POLICY "reels_insert_own"
ON reels FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reels_update_own" ON reels;
CREATE POLICY "reels_update_own"
ON reels FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reels_delete_own" ON reels;
CREATE POLICY "reels_delete_own"
ON reels FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ STORIES TABLE ============
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text DEFAULT 'image',
  caption text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '24 hours')
);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_select_all" ON stories;
CREATE POLICY "stories_select_all"
ON stories FOR SELECT TO authenticated USING (expires_at > now());

DROP POLICY IF EXISTS "stories_insert_own" ON stories;
CREATE POLICY "stories_insert_own"
ON stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "stories_update_own" ON stories;
CREATE POLICY "stories_update_own"
ON stories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "stories_delete_own" ON stories;
CREATE POLICY "stories_delete_own"
ON stories FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_user_id ON reels(user_id);
CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at);
