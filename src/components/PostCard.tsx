import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { useToast } from '@/context/ToastContext';
import { Post, Comment, Profile } from '@/types';
import { timeAgo, formatCount } from '@/lib/utils';
import { createNotification } from '@/lib/notifications';
import Avatar from './Avatar';
import RichText from './RichText';
import Modal from './Modal';
import CommentSection from './CommentSection';
import { Heart, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal, Trash2, Flag, Play } from 'lucide-react';

interface PostCardProps {
  post: Post;
  onDelete?: (id: string) => void;
}

export default function PostCard({ post, onDelete }: PostCardProps) {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const { showToast } = useToast();
  const [liked, setLiked] = useState(post.liked_by_me || false);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [saved, setSaved] = useState(post.saved_by_me || false);
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const isOwn = profile?.id === post.user_id;
  const displayProfile = post.profile;

  // Realtime subscription for likes
  useEffect(() => {
    const channel = supabase
      .channel(`post-likes-${post.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_likes', filter: `post_id=eq.${post.id}` }, (payload) => {
        setLikeCount(prev => prev + 1);
        if (payload.new.user_id === profile?.id) setLiked(true);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'post_likes', filter: `post_id=eq.${post.id}` }, (payload) => {
        setLikeCount(prev => Math.max(0, prev - 1));
        if (payload.old.user_id === profile?.id) setLiked(false);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${post.id}` }, () => {
        setCommentCount(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments', filter: `post_id=eq.${post.id}` }, () => {
        setCommentCount(prev => Math.max(0, prev - 1));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [post.id, profile?.id]);

  const handleLike = async () => {
    if (!profile) return;
    if (liked) {
      setLiked(false);
      setLikeCount(prev => Math.max(0, prev - 1));
      await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', profile.id);
    } else {
      setLiked(true);
      setLikeCount(prev => prev + 1);
      await supabase.from('post_likes').insert({ post_id: post.id, user_id: profile.id });
      // Notify post owner (or repost owner if it's a repost)
      const recipientId = post.is_repost ? post.user_id : post.user_id;
      if (recipientId !== profile.id) {
        const actorName = profile.username;
        const notifText = post.is_repost
          ? `@${actorName} liked your repost.`
          : `@${actorName} liked your post.`;
        await createNotification({
          recipient_id: recipientId,
          actor_id: profile.id,
          type: post.is_repost ? 'like_repost' : 'like_post',
          text: notifText,
          post_id: post.id,
        });
      }
    }
  };

  const handleDoubleTap = () => {
    if (!liked && profile) {
      handleLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    if (saved) {
      setSaved(false);
      await supabase.from('saves').delete().eq('post_id', post.id).eq('user_id', profile.id);
      showToast('Removed from saved', 'info');
    } else {
      setSaved(true);
      await supabase.from('saves').insert({ post_id: post.id, user_id: profile.id });
      showToast('Saved', 'success');
    }
  };

  const handleRepost = async () => {
    if (!profile) return;

    // Check if already reposted
    const { data: existing } = await supabase
      .from('posts')
      .select('id')
      .eq('original_post_id', post.id)
      .eq('user_id', profile.id)
      .maybeSingle();

    if (existing) {
      showToast('You already reposted this', 'info');
      return;
    }

    const { error } = await supabase
      .from('posts')
      .insert({
        is_repost: true,
        original_post_id: post.id,
        original_user_id: post.user_id,
        caption: '',
        media_urls: [],
      });

    if (error) {
      showToast('Failed to repost', 'error');
      return;
    }

    showToast('Reposted!', 'success');

    // Notify original creator
    if (post.user_id !== profile.id) {
      await createNotification({
        recipient_id: post.user_id,
        actor_id: profile.id,
        type: 'repost_post',
        text: `@${profile.username} reposted your post.`,
        post_id: post.id,
      });
    }
  };

  const handleDelete = async () => {
    if (!profile || !isOwn) return;
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) {
      showToast('Failed to delete', 'error');
      return;
    }
    showToast('Post deleted', 'success');
    onDelete?.(post.id);
    setShowMenu(false);
  };

  const handleReport = () => {
    showToast('Report submitted', 'info');
    setShowMenu(false);
  };

  const handleShareViaDM = async (targetUserId: string) => {
    if (!profile) return;

    // Find or create conversation
    const { data: existingConvs } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', profile.id);

    let conversationId: string | null = null;

    if (existingConvs && existingConvs.length > 0) {
      for (const cp of existingConvs) {
        const { data: other } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', cp.conversation_id)
          .neq('user_id', profile.id)
          .maybeSingle();
        if (other?.user_id === targetUserId) {
          conversationId = cp.conversation_id;
          break;
        }
      }
    }

    if (!conversationId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({})
        .select('id')
        .single();
      if (!newConv) return;
      conversationId = newConv.id;
      await supabase.from('conversation_participants').insert([
        { conversation_id: conversationId, user_id: profile.id },
        { conversation_id: conversationId, user_id: targetUserId },
      ]);
    }

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: profile.id,
      shared_post_id: post.id,
    });

    // Notify the recipient about the share
    await createNotification({
      recipient_id: targetUserId,
      actor_id: profile.id,
      type: 'share_post',
      text: `@${profile.username} shared a post with you.`,
      post_id: post.id,
    });

    showToast('Post shared via DM', 'success');
    setShowShare(false);
  };

  return (
    <article className="card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <Avatar
          profile={displayProfile || { id: post.user_id, username: 'user', display_name: null, bio: null, avatar_url: null, created_at: '', updated_at: '' }}
          size="md"
          onClick={() => navigate('profile', post.user_id)}
        />
        <div className="flex-1 min-w-0">
          <button onClick={() => navigate('profile', post.user_id)} className="font-semibold text-sm text-slate-900 hover:underline truncate block">
            {displayProfile?.display_name || displayProfile?.username || 'user'}
          </button>
          <div className="text-xs text-slate-400">
            @{displayProfile?.username} · {timeAgo(post.created_at)}
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded-lg hover:bg-slate-100">
            <MoreHorizontal className="w-5 h-5 text-slate-500" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[160px] animate-scale-in">
                {isOwn ? (
                  <button onClick={handleDelete} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                ) : (
                  <>
                    <button onClick={handleReport} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                      <Flag className="w-4 h-4" /> Report
                    </button>
                    <button onClick={() => { navigate('profile', post.user_id); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                      View Profile
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Repost indicator */}
      {post.is_repost && (
        <div className="px-4 pb-2 text-xs text-slate-400 flex items-center gap-1.5">
          <Repeat2 className="w-3.5 h-3.5" />
          Reposted from @{post.original_profile?.username || 'user'}
        </div>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="px-4 pb-3 text-sm text-slate-700 leading-relaxed">
          <RichText
            text={post.caption}
            onMentionClick={(u) => navigate('profile', u)}
          />
        </div>
      )}

      {/* Media */}
      {post.media_urls && post.media_urls.length > 0 && (
        <div onDoubleClick={handleDoubleTap} className="relative bg-slate-900 select-none">
          {showHeart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <Heart className="w-20 h-20 text-white fill-white heart-burst" />
            </div>
          )}
          {post.media_urls.length === 1 ? (
            post.media_type === 'video' ? (
              <video src={post.media_urls[0]} className="w-full max-h-[600px] object-contain" controls />
            ) : (
              <img src={post.media_urls[0]} className="w-full max-h-[600px] object-contain" alt="" />
            )
          ) : (
            <div className="flex overflow-x-auto no-scrollbar">
              {post.media_urls.map((url, i) => (
                post.media_type === 'video' ? (
                  <video key={i} src={url} className="w-full max-h-[600px] object-contain flex-shrink-0" controls />
                ) : (
                  <img key={i} src={url} className="w-full max-h-[600px] object-contain flex-shrink-0" alt="" />
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all active:scale-90 ${
            liked ? 'text-rose-500' : 'text-slate-600 hover:text-rose-500'
          }`}
        >
          <Heart className={`w-5 h-5 ${liked ? 'fill-rose-500' : ''} ${liked ? 'animate-pop' : ''}`} />
          {likeCount > 0 && <span className="text-sm font-medium">{formatCount(likeCount)}</span>}
        </button>

        <button
          onClick={() => setShowComments(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 hover:text-sky-500 transition-all active:scale-90"
        >
          <MessageCircle className="w-5 h-5" />
          {commentCount > 0 && <span className="text-sm font-medium">{formatCount(commentCount)}</span>}
        </button>

        <button
          onClick={handleRepost}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 hover:text-emerald-500 transition-all active:scale-90"
        >
          <Repeat2 className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowShare(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 hover:text-sky-500 transition-all active:scale-90"
        >
          <Share2 className="w-5 h-5" />
        </button>

        <button
          onClick={handleSave}
          className={`ml-auto flex items-center px-3 py-2 rounded-lg transition-all active:scale-90 ${
            saved ? 'text-amber-500' : 'text-slate-600 hover:text-amber-500'
          }`}
        >
          <Bookmark className={`w-5 h-5 ${saved ? 'fill-amber-500' : ''} ${saved ? 'animate-pop' : ''}`} />
        </button>
      </div>

      {/* Comments modal */}
      {showComments && (
        <Modal open={showComments} onClose={() => setShowComments(false)} title="Comments">
          <CommentSection
            postId={post.id}
            postOwnerId={post.user_id}
            onCommentCountChange={setCommentCount}
          />
        </Modal>
      )}

      {/* Share modal */}
      {showShare && profile && (
        <ShareModal
          open={showShare}
          onClose={() => setShowShare(false)}
          onShare={handleShareViaDM}
          currentUserId={profile.id}
        />
      )}
    </article>
  );
}

import { Search as SearchIcon } from 'lucide-react';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  onShare: (userId: string) => void;
  currentUserId: string;
}

function ShareModal({ open, onClose, onShare, currentUserId }: ShareModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUserId)
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(20);
      if (!error && data) setResults(data as Profile[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, currentUserId]);

  return (
    <Modal open={open} onClose={onClose} title="Share via DM">
      <div className="p-4">
        <div className="relative mb-4">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users to share with..."
            className="input-field pl-10"
            autoFocus
          />
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {loading && <div className="text-center text-sm text-slate-400 py-4">Searching...</div>}
          {!loading && results.length === 0 && query.trim() && (
            <div className="text-center text-sm text-slate-400 py-4">No users found</div>
          )}
          {!loading && results.map((user) => (
            <button
              key={user.id}
              onClick={() => onShare(user.id)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors text-left"
            >
              <Avatar profile={user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{user.display_name || user.username}</div>
                <div className="text-xs text-slate-400">@{user.username}</div>
              </div>
              <span className="text-xs text-sky-600 font-medium">Send</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
