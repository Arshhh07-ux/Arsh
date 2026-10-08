/*
# SocialX Storage Buckets and Realtime Configuration

## Overview
Creates storage buckets for media uploads and enables realtime on key tables.

## Storage Buckets
- `avatars` — profile photos (public)
- `posts` — post media (photos/videos) (public)
- `reels` — reel videos (public)
- `stories` — story media (photos/videos) (public)
- `messages` — DM media attachments (public)

All buckets are public-read since social media content is meant to be visible.

## Realtime
Enables realtime replication on: posts, reels, stories, comments, post_likes, reel_likes, story_likes, follows, notifications, messages, conversation_participants, saves, story_views, comment_likes, message_reactions

## Notes
1. Storage policies allow authenticated users to upload to all buckets.
2. All buckets are public for read access.
3. Realtime is enabled via ALTER TABLE ... REPLICA IDENTITY FULL for accurate change data.
*/

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('posts', 'posts', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('reels', 'reels', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('messages', 'messages', true) ON CONFLICT (id) DO NOTHING;

-- ============ STORAGE POLICIES ============
-- All authenticated users can upload to any bucket; all can read (public buckets).

-- avatars
DROP POLICY IF EXISTS "avatars_read_all" ON storage.objects;
CREATE POLICY "avatars_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_upload_own" ON storage.objects;
CREATE POLICY "avatars_upload_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars');

-- posts
DROP POLICY IF EXISTS "posts_read_all" ON storage.objects;
CREATE POLICY "posts_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'posts');
DROP POLICY IF EXISTS "posts_upload_own" ON storage.objects;
CREATE POLICY "posts_upload_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'posts');
DROP POLICY IF EXISTS "posts_delete_own" ON storage.objects;
CREATE POLICY "posts_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'posts');

-- reels
DROP POLICY IF EXISTS "reels_read_all" ON storage.objects;
CREATE POLICY "reels_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'reels');
DROP POLICY IF EXISTS "reels_upload_own" ON storage.objects;
CREATE POLICY "reels_upload_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reels');
DROP POLICY IF EXISTS "reels_delete_own" ON storage.objects;
CREATE POLICY "reels_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'reels');

-- stories
DROP POLICY IF EXISTS "stories_read_all" ON storage.objects;
CREATE POLICY "stories_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'stories');
DROP POLICY IF EXISTS "stories_upload_own" ON storage.objects;
CREATE POLICY "stories_upload_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'stories');
DROP POLICY IF EXISTS "stories_delete_own" ON storage.objects;
CREATE POLICY "stories_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'stories');

-- messages
DROP POLICY IF EXISTS "messages_read_all" ON storage.objects;
CREATE POLICY "messages_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'messages');
DROP POLICY IF EXISTS "messages_upload_own" ON storage.objects;
CREATE POLICY "messages_upload_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'messages');
DROP POLICY IF EXISTS "messages_delete_own" ON storage.objects;
CREATE POLICY "messages_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'messages');

-- ============ REALTIME PUBLICATION ============
-- Add all interactive tables to the realtime publication.
-- Using REPLICA IDENTITY FULL so that DELETE events include old row data.

ALTER TABLE posts REPLICA IDENTITY FULL;
ALTER TABLE reels REPLICA IDENTITY FULL;
ALTER TABLE stories REPLICA IDENTITY FULL;
ALTER TABLE comments REPLICA IDENTITY FULL;
ALTER TABLE post_likes REPLICA IDENTITY FULL;
ALTER TABLE reel_likes REPLICA IDENTITY FULL;
ALTER TABLE story_likes REPLICA IDENTITY FULL;
ALTER TABLE comment_likes REPLICA IDENTITY FULL;
ALTER TABLE follows REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversation_participants REPLICA IDENTITY FULL;
ALTER TABLE saves REPLICA IDENTITY FULL;
ALTER TABLE story_views REPLICA IDENTITY FULL;
ALTER TABLE message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- Add tables to the supabase_realtime publication if not already members
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE posts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reels') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE reels;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stories') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stories;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'post_likes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE post_likes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reel_likes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE reel_likes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'story_likes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE story_likes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'comment_likes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comment_likes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'follows') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE follows;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_participants') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'saves') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE saves;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'story_views') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE story_views;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
END $$;
