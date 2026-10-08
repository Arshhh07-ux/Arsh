import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

export async function createNotification(params: {
  recipient_id: string;
  actor_id: string;
  type: string;
  text: string;
  post_id?: string | null;
  reel_id?: string | null;
  story_id?: string | null;
  comment_id?: string | null;
  message_id?: string | null;
  conversation_id?: string | null;
}) {
  // Don't notify yourself
  if (params.recipient_id === params.actor_id) return;

  const { error } = await supabase.from('notifications').insert({
    recipient_id: params.recipient_id,
    actor_id: params.actor_id,
    type: params.type,
    text: params.text,
    post_id: params.post_id || null,
    reel_id: params.reel_id || null,
    story_id: params.story_id || null,
    comment_id: params.comment_id || null,
    message_id: params.message_id || null,
    conversation_id: params.conversation_id || null,
  });

  if (error) {
    console.error('Failed to create notification:', error);
  }
}

export async function getActorProfile(actorId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', actorId)
    .maybeSingle();
  if (error) return null;
  return data as Profile;
}

export async function notifyMentions(
  text: string,
  actorId: string,
  type: 'mention_post' | 'mention_reel' | 'mention_story',
  postId?: string,
  reelId?: string,
  storyId?: string
) {
  const mentions = text.match(/@([a-z0-9_]+)/gi);
  if (!mentions) return;

  const usernames = [...new Set(mentions.map(m => m.slice(1).toLowerCase()))];

  for (const username of usernames) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (profile && profile.id !== actorId) {
      const actor = await getActorProfile(actorId);
      const actorName = actor?.username || 'Someone';
      await createNotification({
        recipient_id: profile.id,
        actor_id: actorId,
        type,
        text: `@${actorName} mentioned you in a ${type === 'mention_post' ? 'post' : type === 'mention_reel' ? 'reel' : 'story'}.`,
        post_id: postId,
        reel_id: reelId,
        story_id: storyId,
      });
    }
  }
}
