import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { useToast } from '@/context/ToastContext';
import { Reel } from '@/types';
import { formatCount } from '@/lib/utils';
import { createNotification, notifyMentions } from '@/lib/notifications';
import Avatar from '@/components/Avatar';
import Modal from '@/components/Modal';
import CommentSection from '@/components/CommentSection';
import RichText from '@/components/RichText';
import { Heart, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal, Music, Play, Flag, Trash2, UserPlus, UserCheck } from 'lucide-react';

interface ReelsPageProps {
  startReelId?: string;
}

export default function ReelsPage({ startReelId }: ReelsPageProps) {
  const { profile } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchReels = useCallback(async () => {
    const { data, error } = await supabase
      .from('reels')
      .select(`
        *,
        profile:profiles!reels_user_id_fkey(*),
        original_profile:profiles!reels_original_user_id_fkey(*)
      `)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !data) {
      setLoading(false);
      return;
    }

    const reelIds = data.map(r => r.id);
    let likeMap = new Map<string, number>();
    let myLikeSet = new Set<string>();
    let mySaveSet = new Set<string>();
    let commentMap = new Map<string, number>();

    if (profile) {
      const [{ data: likes }, { data: myLikes }, { data: saves }, { data: comments }] = await Promise.all([
        supabase.from('reel_likes').select('reel_id').in('reel_id', reelIds),
        supabase.from('reel_likes').select('reel_id').in('reel_id', reelIds).eq('user_id', profile.id),
        supabase.from('saves').select('reel_id').in('reel_id', reelIds).eq('user_id', profile.id),
        supabase.from('comments').select('reel_id').in('reel_id', reelIds),
      ]);
      for (const l of likes || []) likeMap.set(l.reel_id, (likeMap.get(l.reel_id) || 0) + 1);
      myLikeSet = new Set((myLikes || []).map(l => l.reel_id));
      mySaveSet = new Set((saves || []).map(s => s.reel_id));
      for (const c of comments || []) commentMap.set(c.reel_id, (commentMap.get(c.reel_id) || 0) + 1);
    }

    const formatted: Reel[] = data.map(r => ({
      ...r,
      profile: r.profile as any,
      original_profile: r.original_profile as any,
      like_count: likeMap.get(r.id) || 0,
      comment_count: commentMap.get(r.id) || 0,
      liked_by_me: myLikeSet.has(r.id),
      saved_by_me: mySaveSet.has(r.id),
    }));

    setReels(formatted);

    // If startReelId provided, find and scroll to it
    if (startReelId) {
      const idx = formatted.findIndex(r => r.id === startReelId);
      if (idx >= 0) {
        setActiveIndex(idx);
      }
    }

    setLoading(false);
  }, [profile?.id, startReelId]);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  // Realtime for new reels
  useEffect(() => {
    const channel = supabase
      .channel('reels-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reels' }, () => fetchReels())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reels' }, () => fetchReels())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchReels]);

  // Intersection observer for active reel
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-index'));
            setActiveIndex(idx);
          }
        });
      },
      { threshold: 0.6 }
    );
    const items = containerRef.current.querySelectorAll('[data-index]');
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [reels]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400">No reels yet. Be the first to share!</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-4rem)] md:h-screen overflow-y-auto snap-y-mandatory no-scrollbar bg-black"
    >
      {reels.map((reel, idx) => (
        <ReelCard
          key={reel.id}
          reel={reel}
          isActive={idx === activeIndex}
          index={idx}
          onDelete={(id) => setReels(prev => prev.filter(r => r.id !== id))}
        />
      ))}
    </div>
  );
}

interface ReelCardProps {
  reel: Reel;
  isActive: boolean;
  index: number;
  onDelete: (id: string) => void;
}

function ReelCard({ reel, isActive, index, onDelete }: ReelCardProps) {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const { showToast } = useToast();
  const [liked, setLiked] = useState(reel.liked_by_me || false);
  const [likeCount, setLikeCount] = useState(reel.like_count || 0);
  const [saved, setSaved] = useState(reel.saved_by_me || false);
  const [commentCount, setCommentCount] = useState(reel.comment_count || 0);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isOwn = profile?.id === reel.user_id;

  // Auto-play active reel
  useEffect(() => {
    if (videoRef.current) {
      if (isActive) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isActive]);

  // Check follow status
  useEffect(() => {
    if (!profile || isOwn) return;
    (async () => {
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', profile.id)
        .eq('following_id', reel.user_id)
        .maybeSingle();
      setIsFollowing(!!data);
    })();
  }, [profile?.id, reel.user_id, isOwn]);

  // Realtime likes
  useEffect(() => {
    const channel = supabase
      .channel(`reel-likes-${reel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reel_likes', filter: `reel_id=eq.${reel.id}` }, (payload) => {
        setLikeCount(prev => prev + 1);
        if (payload.new.user_id === profile?.id) setLiked(true);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reel_likes', filter: `reel_id=eq.${reel.id}` }, (payload) => {
        setLikeCount(prev => Math.max(0, prev - 1));
        if (payload.old.user_id === profile?.id) setLiked(false);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `reel_id=eq.${reel.id}` }, () => {
        setCommentCount(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments', filter: `reel_id=eq.${reel.id}` }, () => {
        setCommentCount(prev => Math.max(0, prev - 1));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [reel.id, profile?.id]);

  const handleLike = async () => {
    if (!profile) return;
    if (liked) {
      setLiked(false);
      setLikeCount(prev => Math.max(0, prev - 1));
      await supabase.from('reel_likes').delete().eq('reel_id', reel.id).eq('user_id', profile.id);
    } else {
      setLiked(true);
      setLikeCount(prev => prev + 1);
      await supabase.from('reel_likes').insert({ reel_id: reel.id, user_id: profile.id });
      if (reel.user_id !== profile.id) {
        await createNotification({
          recipient_id: reel.user_id,
          actor_id: profile.id,
          type: reel.is_repost ? 'like_repost' : 'like_reel',
          text: reel.is_repost
            ? `@${profile.username} liked your repost.`
            : `@${profile.username} liked your reel.`,
          reel_id: reel.id,
        });
      }
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    if (saved) {
      setSaved(false);
      await supabase.from('saves').delete().eq('reel_id', reel.id).eq('user_id', profile.id);
    } else {
      setSaved(true);
      await supabase.from('saves').insert({ reel_id: reel.id, user_id: profile.id });
      showToast('Saved', 'success');
    }
  };

  const handleRepost = async () => {
    if (!profile) return;
    const { data: existing } = await supabase
      .from('reels')
      .select('id')
      .eq('original_reel_id', reel.id)
      .eq('user_id', profile.id)
      .maybeSingle();
    if (existing) { showToast('Already reposted', 'info'); return; }

    const { error } = await supabase.from('reels').insert({
      is_repost: true,
      original_reel_id: reel.id,
      original_user_id: reel.user_id,
      video_url: reel.video_url,
      caption: '',
    });
    if (error) { showToast('Failed to repost', 'error'); return; }
    showToast('Reposted!', 'success');
    if (reel.user_id !== profile.id) {
      await createNotification({
        recipient_id: reel.user_id,
        actor_id: profile.id,
        type: 'repost_reel',
        text: `@${profile.username} reposted your reel.`,
        reel_id: reel.id,
      });
    }
  };

  const handleFollow = async () => {
    if (!profile) return;
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', profile.id).eq('following_id', reel.user_id);
      setIsFollowing(false);
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: reel.user_id });
      setIsFollowing(true);
      await createNotification({
        recipient_id: reel.user_id,
        actor_id: profile.id,
        type: 'follow',
        text: `@${profile.username} started following you.`,
      });
    }
  };

  const handleDelete = async () => {
    if (!profile || !isOwn) return;
    await supabase.from('reels').delete().eq('id', reel.id);
    showToast('Reel deleted', 'success');
    onDelete(reel.id);
    setShowMenu(false);
  };

  return (
    <div
      data-index={index}
      className="snap-start-item h-[calc(100vh-4rem)] md:h-screen flex items-center justify-center relative"
    >
      <video
        ref={videoRef}
        src={reel.video_url}
        className="w-full h-full object-cover"
        loop
        playsInline
        onClick={() => { if (videoRef.current) { if (videoRef.current.paused) videoRef.current.play(); else videoRef.current.pause(); } }}
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />

      {/* Top bar */}
      <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-4 z-20">
        <span className="text-white font-bold text-lg">Reels</span>
        {isOwn ? (
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-white">
              <MoreHorizontal className="w-6 h-6" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg py-1 min-w-[140px]">
                  <button onClick={handleDelete} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-white">
            <MoreHorizontal className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Repost indicator */}
      {reel.is_repost && (
        <div className="absolute top-16 left-4 z-20 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full text-white text-xs flex items-center gap-1.5">
          <Repeat2 className="w-3.5 h-3.5" />
          Reposted from @{reel.original_profile?.username || 'user'}
        </div>
      )}

      {/* Right action bar */}
      <div className="absolute right-3 bottom-24 md:bottom-8 flex flex-col items-center gap-5 z-20">
        <div className="flex flex-col items-center">
          <Avatar profile={reel.profile!} size="lg" onClick={() => navigate('profile', reel.user_id)} />
          {!isOwn && (
            <button
              onClick={handleFollow}
              className={`mt-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                isFollowing ? 'bg-white/20 text-white' : 'bg-sky-500 text-white'
              }`}
            >
              {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </button>
          )}
        </div>

        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <Heart className={`w-7 h-7 ${liked ? 'fill-rose-500 text-rose-500' : 'text-white'} transition-all active:scale-90`} />
          <span className="text-white text-xs font-medium">{formatCount(likeCount)}</span>
        </button>

        <button onClick={() => setShowComments(true)} className="flex flex-col items-center gap-1">
          <MessageCircle className="w-7 h-7 text-white transition-all active:scale-90" />
          <span className="text-white text-xs font-medium">{formatCount(commentCount)}</span>
        </button>

        <button onClick={handleRepost} className="flex flex-col items-center gap-1">
          <Repeat2 className="w-7 h-7 text-white transition-all active:scale-90" />
        </button>

        <button onClick={handleSave} className="flex flex-col items-center gap-1">
          <Bookmark className={`w-7 h-7 ${saved ? 'fill-amber-400 text-amber-400' : 'text-white'} transition-all active:scale-90`} />
        </button>

        <button onClick={() => showToast('Link copied', 'success')} className="flex flex-col items-center gap-1">
          <Share2 className="w-7 h-7 text-white transition-all active:scale-90" />
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-24 md:bottom-8 left-4 right-20 z-20">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => navigate('profile', reel.user_id)} className="text-white font-semibold text-sm hover:underline">
            @{reel.profile?.username}
          </button>
        </div>
        {reel.caption && (
          <p className="text-white text-sm mb-2 leading-relaxed line-clamp-3">
            <RichText text={reel.caption} onMentionClick={(u) => navigate('profile', u)} />
          </p>
        )}
        {reel.audio_title && (
          <div className="flex items-center gap-2 text-white/80 text-xs">
            <Music className="w-3.5 h-3.5" />
            <span className="truncate">{reel.audio_title}</span>
          </div>
        )}
      </div>

      {/* Comments modal */}
      {showComments && (
        <Modal open={showComments} onClose={() => setShowComments(false)} title="Comments">
          <CommentSection
            reelId={reel.id}
            postOwnerId={reel.user_id}
            onCommentCountChange={setCommentCount}
          />
        </Modal>
      )}
    </div>
  );
}
