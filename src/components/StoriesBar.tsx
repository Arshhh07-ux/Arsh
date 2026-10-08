import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { useToast } from '@/context/ToastContext';
import { Story, Profile } from '@/types';
import { createNotification } from '@/lib/notifications';
import Avatar from './Avatar';
import Modal from './Modal';
import { Plus, X, Heart, Send, Eye, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

export default function StoriesBar() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [stories, setStories] = useState<{ user: Profile; items: Story[] }[]>([]);
  const [viewing, setViewing] = useState<{ user: Profile; items: Story[]; index: number } | null>(null);

  const fetchStories = useCallback(async () => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        profile:profiles!stories_user_id_fkey(*)
      `)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (error || !data) return;

    // Group by user
    const byUser = new Map<string, { user: Profile; items: Story[] }>();
    for (const story of data) {
      const existing = byUser.get(story.user_id);
      const item = { ...story, profile: story.profile as Profile } as Story;
      if (existing) {
        existing.items.unshift(item);
      } else {
        byUser.set(story.user_id, { user: story.profile as Profile, items: [item] });
      }
    }

    // Sort so current user's stories come first
    const sorted = Array.from(byUser.values()).sort((a, b) => {
      if (a.user.id === profile?.id) return -1;
      if (b.user.id === profile?.id) return 1;
      return 0;
    });

    setStories(sorted);
  }, [profile?.id]);

  useEffect(() => {
    fetchStories();
    const channel = supabase
      .channel('stories-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stories' }, () => fetchStories())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stories' }, () => fetchStories())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStories]);

  const handleView = (userIdx: number) => {
    const group = stories[userIdx];
    if (!group) return;
    setViewing({ user: group.user, items: group.items, index: 0 });
    markViewed(group.items[0]);
  };

  const markViewed = async (story: Story) => {
    if (!profile || story.user_id === profile.id) return;
    await supabase.from('story_views').upsert({ story_id: story.id, user_id: profile.id });
  };

  const nextStory = () => {
    if (!viewing) return;
    if (viewing.index < viewing.items.length - 1) {
      const newIndex = viewing.index + 1;
      setViewing({ ...viewing, index: newIndex });
      markViewed(viewing.items[newIndex]);
    } else {
      // Move to next user's stories
      const currentIdx = stories.findIndex(s => s.user.id === viewing.user.id);
      if (currentIdx < stories.length - 1) {
        const nextGroup = stories[currentIdx + 1];
        setViewing({ user: nextGroup.user, items: nextGroup.items, index: 0 });
        markViewed(nextGroup.items[0]);
      } else {
        setViewing(null);
      }
    }
  };

  const prevStory = () => {
    if (!viewing) return;
    if (viewing.index > 0) {
      setViewing({ ...viewing, index: viewing.index - 1 });
    } else {
      const currentIdx = stories.findIndex(s => s.user.id === viewing.user.id);
      if (currentIdx > 0) {
        const prevGroup = stories[currentIdx - 1];
        setViewing({ user: prevGroup.user, items: prevGroup.items, index: prevGroup.items.length - 1 });
      }
    }
  };

  if (stories.length === 0) return null;

  return (
    <>
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
          {stories.map((group, idx) => (
            <button
              key={group.user.id}
              onClick={() => handleView(idx)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
            >
              <div className="relative">
                <div className="gradient-border">
                  <div className="bg-white p-[2px] rounded-full">
                    <Avatar profile={group.user} size="lg" />
                  </div>
                </div>
                {group.user.id === profile?.id && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center border-2 border-white">
                    <Plus className="w-3 h-3" />
                  </div>
                )}
              </div>
              <span className="text-xs text-slate-500 max-w-[64px] truncate">
                {group.user.id === profile?.id ? 'Your story' : group.user.username}
              </span>
            </button>
          ))}
        </div>
      </div>

      {viewing && (
        <StoryViewer
          viewing={viewing}
          onClose={() => setViewing(null)}
          onNext={nextStory}
          onPrev={prevStory}
        />
      )}
    </>
  );
}

interface StoryViewerProps {
  viewing: { user: Profile; items: Story[]; index: number };
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

function StoryViewer({ viewing, onClose, onNext, onPrev }: StoryViewerProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [replyText, setReplyText] = useState('');
  const [viewers, setViewers] = useState<Profile[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);

  const story = viewing.items[viewing.index];
  const isOwn = profile?.id === story?.user_id;

  useEffect(() => {
    if (!story) return;
    setReplyText('');
    setLiked(false);
    setLikeCount(0);
    setViewers([]);

    // Fetch like count and viewed status
    (async () => {
      const { count } = await supabase
        .from('story_likes')
        .select('id', { count: 'exact', head: true })
        .eq('story_id', story.id);
      setLikeCount(count || 0);

      if (profile) {
        const { data: myLike } = await supabase
          .from('story_likes')
          .select('id')
          .eq('story_id', story.id)
          .eq('user_id', profile.id)
          .maybeSingle();
        setLiked(!!myLike);
      }

      if (isOwn) {
        const { data: viewsData } = await supabase
          .from('story_views')
          .select('profile:profiles!story_views_user_id_fkey(*)')
          .eq('story_id', story.id);
        setViewers((viewsData?.map((v: any) => v.profile as Profile) || []) as Profile[]);
      }
    })();
  }, [story?.id, isOwn, profile?.id]);

  if (!story) return null;

  const handleLike = async () => {
    if (!profile) return;
    if (liked) {
      await supabase.from('story_likes').delete().eq('story_id', story.id).eq('user_id', profile.id);
      setLiked(false);
      setLikeCount(prev => Math.max(0, prev - 1));
    } else {
      await supabase.from('story_likes').insert({ story_id: story.id, user_id: profile.id });
      setLiked(true);
      setLikeCount(prev => prev + 1);
      if (story.user_id !== profile.id) {
        await createNotification({
          recipient_id: story.user_id,
          actor_id: profile.id,
          type: 'like_story',
          text: `@${profile.username} liked your story.`,
          story_id: story.id,
        });
      }
    }
  };

  const handleReply = async () => {
    if (!profile || !replyText.trim()) return;
    await createNotification({
      recipient_id: story.user_id,
      actor_id: profile.id,
      type: 'story_reply',
      text: `@${profile.username} replied to your story: "${replyText.trim()}"`,
      story_id: story.id,
    });
    showToast('Reply sent!', 'success');
    setReplyText('');
  };

  const handleDelete = async () => {
    if (!profile || !isOwn) return;
    await supabase.from('stories').delete().eq('id', story.id);
    showToast('Story deleted', 'success');
    onClose();
  };

  const progress = ((viewing.index + 1) / viewing.items.length) * 100;

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-lg">
      <div className="relative bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '9/16', maxHeight: '85vh' }}>
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-20 p-2 flex gap-1">
          {viewing.items.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: i < viewing.index ? '100%' : i === viewing.index ? '100%' : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-4 left-0 right-0 z-20 flex items-center gap-3 px-4 pt-2">
          <Avatar profile={viewing.user} size="sm" />
          <div className="flex-1">
            <div className="text-white text-sm font-medium">{viewing.user.username}</div>
          </div>
          {isOwn && (
            <button onClick={() => setShowViewers(!showViewers)} className="text-white/80 text-xs flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {viewers.length}
            </button>
          )}
          <button onClick={onClose} className="text-white/80">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Media */}
        {story.media_type === 'video' ? (
          <video src={story.media_url} className="w-full h-full object-cover" autoPlay playsInline />
        ) : (
          <img src={story.media_url} className="w-full h-full object-cover" />
        )}

        {/* Caption overlay */}
        {story.caption && (
          <div className="absolute bottom-24 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
            <p className="text-white text-sm">{story.caption}</p>
          </div>
        )}

        {/* Navigation arrows */}
        <button onClick={onPrev} className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={onNext} className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30">
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Viewers list */}
        {showViewers && isOwn && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur rounded-t-2xl max-h-48 overflow-y-auto animate-slide-up">
            <div className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-100">Viewers</div>
            {viewers.length === 0 ? (
              <div className="p-4 text-sm text-slate-400 text-center">No views yet</div>
            ) : (
              viewers.map(v => (
                <div key={v.id} className="flex items-center gap-3 p-2.5">
                  <Avatar profile={v} size="sm" />
                  <span className="text-sm font-medium text-slate-700">{v.username}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Bottom actions */}
        {!isOwn ? (
          <div className="absolute bottom-0 left-0 right-0 z-20 p-4 flex items-center gap-3 bg-gradient-to-t from-black/60 to-transparent">
            <button onClick={handleLike} className="text-white">
              <Heart className={`w-6 h-6 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to ${viewing.user.username}...`}
              className="flex-1 bg-white/10 backdrop-blur text-white text-sm rounded-full px-4 py-2 placeholder:text-white/50 outline-none border border-white/20"
              onKeyDown={(e) => { if (e.key === 'Enter' && replyText.trim()) handleReply(); }}
            />
            <button onClick={handleReply} className="text-white">
              <Send className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="absolute bottom-0 left-0 right-0 z-20 p-4 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent">
            <div className="text-white/80 text-sm">
              {likeCount} {likeCount === 1 ? 'like' : 'likes'}
            </div>
            <button onClick={handleDelete} className="text-white/80">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
