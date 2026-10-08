/*
# SocialX Engagement Tables: Likes, Comments, Replies, Saves, Story Views

## Overview
Creates engagement tables for all content interactions.

## New Tables

### post_likes
- `id` (uuid, PK)
- `post_id` (uuid, FK to posts, CASCADE)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid())
- `created_at` (timestamptz)
- UNIQUE(post_id, user_id)

### reel_likes
- Same structure as post_likes but for reels

### story_likes
- Same structure but for stories

### comments
- `id` (uuid, PK)
- `post_id` (uuid, FK to posts, CASCADE) — nullable, set if commenting on a post
- `reel_id` (uuid, FK to reels, CASCADE) — nullable, set if commenting on a reel
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid())
- `content` (text, NOT NULL)
- `parent_id` (uuid, FK to comments, CASCADE) — nullable, set if this is a reply
- `created_at` (timestamptz)

### comment_likes
- `id` (uuid, PK)
- `comment_id` (uuid, FK to comments, CASCADE)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid())
- `created_at` (timestamptz)
- UNIQUE(comment_id, user_id)

### saves
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid())
- `post_id` (uuid, FK to posts, CASCADE, nullable)
- `reel_id` (uuid, FK to reels, CASCADE, nullable)
- `created_at` (timestamptz)
- UNIQUE(user_id, post_id), UNIQUE(user_id, reel_id)

### story_views
- `id` (uuid, PK)
- `story_id` (uuid, FK to stories, CASCADE)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid())
- `created_at` (timestamptz)
- UNIQUE(story_id, user_id)

## Security
- RLS on all tables
- SELECT: all authenticated users can read (needed for counts and feeds)
- INSERT: users can only insert their own engagement rows
- DELETE: users can only delete their own engagement rows

## Notes
1. Comments support both posts and reels via nullable foreign keys.
2. Replies are comments with a parent_id pointing to the parent comment.
3. Likes are unique per user per content item (prevents double-likes).
4. Saves track saved posts and reels separately.
*/

-- ============ POST LIKES ============
CREATE TABLE IF NOT EXISTS post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_likes_select_all" ON post_likes;
CREATE POLICY "post_likes_select_all" ON post_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "post_likes_insert_own" ON post_likes;
CREATE POLICY "post_likes_insert_own" ON post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_likes_delete_own" ON post_likes;
CREATE POLICY "post_likes_delete_own" ON post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ REEL LIKES ============
CREATE TABLE IF NOT EXISTS reel_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(reel_id, user_id)
);

ALTER TABLE reel_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reel_likes_select_all" ON reel_likes;
CREATE POLICY "reel_likes_select_all" ON reel_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reel_likes_insert_own" ON reel_likes;
CREATE POLICY "reel_likes_insert_own" ON reel_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reel_likes_delete_own" ON reel_likes;
CREATE POLICY "reel_likes_delete_own" ON reel_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ STORY LIKES ============
CREATE TABLE IF NOT EXISTS story_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(story_id, user_id)
);

ALTER TABLE story_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_likes_select_all" ON story_likes;
CREATE POLICY "story_likes_select_all" ON story_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "story_likes_insert_own" ON story_likes;
CREATE POLICY "story_likes_insert_own" ON story_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "story_likes_delete_own" ON story_likes;
CREATE POLICY "story_likes_delete_own" ON story_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ COMMENTS (posts + reels, with replies) ============
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  reel_id uuid REFERENCES reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT comments_target CHECK (post_id IS NOT NULL OR reel_id IS NOT NULL)
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_all" ON comments;
CREATE POLICY "comments_select_all" ON comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON comments;
CREATE POLICY "comments_insert_own" ON comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_delete_own" ON comments;
CREATE POLICY "comments_delete_own" ON comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ COMMENT LIKES ============
CREATE TABLE IF NOT EXISTS comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes_select_all" ON comment_likes;
CREATE POLICY "comment_likes_select_all" ON comment_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comment_likes_insert_own" ON comment_likes;
CREATE POLICY "comment_likes_insert_own" ON comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comment_likes_delete_own" ON comment_likes;
CREATE POLICY "comment_likes_delete_own" ON comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ SAVES ============
CREATE TABLE IF NOT EXISTS saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  reel_id uuid REFERENCES reels(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id),
  UNIQUE(user_id, reel_id)
);

ALTER TABLE saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saves_select_own" ON saves;
CREATE POLICY "saves_select_own" ON saves FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saves_insert_own" ON saves;
CREATE POLICY "saves_insert_own" ON saves FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saves_delete_own" ON saves;
CREATE POLICY "saves_delete_own" ON saves FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ STORY VIEWS ============
CREATE TABLE IF NOT EXISTS story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(story_id, user_id)
);

ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_views_select_own_or_owner" ON story_views;
CREATE POLICY "story_views_select_own_or_owner" ON story_views FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM stories
    WHERE stories.id = story_views.story_id
    AND stories.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "story_views_insert_own" ON story_views;
CREATE POLICY "story_views_insert_own" ON story_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_reel_likes_reel_id ON reel_likes(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_likes_user_id ON reel_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_story_likes_story_id ON story_likes(story_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_reel_id ON comments(reel_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_saves_user_id ON saves(user_id);
CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON story_views(story_id);
