import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { useToast } from '@/context/ToastContext';
import { Comment, Profile } from '@/types';
import { timeAgo, formatCount } from '@/lib/utils';
import { createNotification } from '@/lib/notifications';
import Avatar from './Avatar';
import RichText from './RichText';
import { Heart, Send, Trash2, CornerDownRight } from 'lucide-react';

interface CommentSectionProps {
  postId?: string;
  reelId?: string;
  postOwnerId?: string;
  onCommentCountChange?: (count: number) => void;
}

export default function CommentSection({ postId, reelId, postOwnerId, onCommentCountChange }: CommentSectionProps) {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const { showToast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState('');

  const fetchComments = useCallback(async () => {
    let query = supabase.from('comments').select(`
      *,
      profile:profiles!comments_user_id_fkey(*),
      like_count:comment_likes(count),
      liked_by_me:comment_likes!inner(user_id)
    `);

    if (postId) query = query.eq('post_id', postId).is('parent_id', null);
    else if (reelId) query = query.eq('reel_id', reelId).is('parent_id', null);

    const { data, error } = await query.order('created_at', { ascending: false });

    // The inner join for liked_by_me will filter out comments the user hasn't liked
    // We need a different approach - fetch without the inner join
    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select(`*, profile:profiles!comments_user_id_fkey(*)`)
      .eq(postId ? 'post_id' : 'reel_id', postId || reelId)
      .is('parent_id', null)
      .order('created_at', { ascending: false });

    if (commentsError || !commentsData) {
      setLoading(false);
      return;
    }

    // Fetch replies for each comment
    const commentIds = commentsData.map(c => c.id);
    const { data: repliesData } = await supabase
      .from('comments')
      .select(`*, profile:profiles!comments_user_id_fkey(*)`)
      .in('parent_id', commentIds)
      .order('created_at', { ascending: true });

    // Fetch like info
    const allCommentIds = [...commentIds, ...(repliesData?.map(r => r.id) || [])];
    const { data: likesData } = await supabase
      .from('comment_likes')
      .select('comment_id, user_id')
      .in('comment_id', allCommentIds);

    const likeMap = new Map<string, { count: number; liked: boolean }>();
    for (const like of likesData || []) {
      const existing = likeMap.get(like.comment_id) || { count: 0, liked: false };
      existing.count++;
      if (like.user_id === profile?.id) existing.liked = true;
      likeMap.set(like.comment_id, existing);
    }

    const repliesByParent = new Map<string, Comment[]>();
    for (const reply of repliesData || []) {
      const arr = repliesByParent.get(reply.parent_id) || [];
      arr.push({
        ...reply,
        profile: reply.profile as Profile,
        like_count: likeMap.get(reply.id)?.count || 0,
        liked_by_me: likeMap.get(reply.id)?.liked || false,
      });
      repliesByParent.set(reply.parent_id, arr);
    }

    const formatted: Comment[] = commentsData.map(c => ({
      ...c,
      profile: c.profile as Profile,
      like_count: likeMap.get(c.id)?.count || 0,
      liked_by_me: likeMap.get(c.id)?.liked || false,
      replies: repliesByParent.get(c.id) || [],
    }));

    setComments(formatted);
    setLoading(false);
  }, [postId, reelId, profile?.id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Realtime
  useEffect(() => {
    const filter = postId ? `post_id=eq.${postId}` : `reel_id=eq.${reelId}`;
    const channel = supabase
      .channel(`comments-${postId || reelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter }, () => fetchComments())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments', filter }, () => fetchComments())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comment_likes' }, () => fetchComments())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comment_likes' }, () => fetchComments())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [postId, reelId, fetchComments]);

  const handleSubmitComment = async () => {
    if (!profile || !newComment.trim()) return;

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId || null,
        reel_id: reelId || null,
        content: newComment.trim(),
      })
      .select('id')
      .single();

    if (error) {
      showToast('Failed to comment', 'error');
      return;
    }

    // Notify post/reel owner
    if (postOwnerId && postOwnerId !== profile.id) {
      await createNotification({
        recipient_id: postOwnerId,
        actor_id: profile.id,
        type: 'comment',
        text: `@${profile.username} commented on your ${postId ? 'post' : 'reel'}.`,
        post_id: postId || null,
        reel_id: reelId || null,
        comment_id: data.id,
      });
    }

    setNewComment('');
    fetchComments();
  };

  const handleSubmitReply = async (parent: Comment) => {
    if (!profile || !replyText.trim()) return;

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId || null,
        reel_id: reelId || null,
        content: replyText.trim(),
        parent_id: parent.id,
      })
      .select('id')
      .single();

    if (error) {
      showToast('Failed to reply', 'error');
      return;
    }

    // Notify the comment owner (not yourself)
    if (parent.user_id !== profile.id) {
      await createNotification({
        recipient_id: parent.user_id,
        actor_id: profile.id,
        type: 'reply',
        text: `@${profile.username} replied to your comment.`,
        post_id: postId || null,
        reel_id: reelId || null,
        comment_id: data.id,
      });
    }

    // Also notify the post/reel owner if they're different from the comment owner
    if (postOwnerId && postOwnerId !== profile.id && postOwnerId !== parent.user_id) {
      await createNotification({
        recipient_id: postOwnerId,
        actor_id: profile.id,
        type: 'reply',
        text: `@${profile.username} replied to a comment on your ${postId ? 'post' : 'reel'}.`,
        post_id: postId || null,
        reel_id: reelId || null,
        comment_id: data.id,
      });
    }

    setReplyText('');
    setReplyingTo(null);
    fetchComments();
  };

  const handleLikeComment = async (comment: Comment) => {
    if (!profile) return;

    if (comment.liked_by_me) {
      await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', profile.id);
    } else {
      await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: profile.id });
      if (comment.user_id !== profile.id) {
        await createNotification({
          recipient_id: comment.user_id,
          actor_id: profile.id,
          type: 'like_post',
          text: `@${profile.username} liked your comment.`,
          comment_id: comment.id,
        });
      }
    }
    fetchComments();
  };

  const handleDeleteComment = async (comment: Comment) => {
    if (!profile || comment.user_id !== profile.id) return;
    const { error } = await supabase.from('comments').delete().eq('id', comment.id);
    if (error) {
      showToast('Failed to delete', 'error');
      return;
    }
    showToast('Comment deleted', 'success');
    fetchComments();
  };

  return (
    <div className="flex flex-col max-h-[70vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && <div className="text-center text-sm text-slate-400 py-8">Loading comments...</div>}
        {!loading && comments.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-8">
            No comments yet. Be the first to comment!
          </div>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3 animate-fade-in">
            <Avatar profile={comment.profile!} size="sm" onClick={() => navigate('profile', comment.user_id)} />
            <div className="flex-1 min-w-0">
              <div className="bg-slate-50 rounded-2xl px-4 py-2.5">
                <button
                  onClick={() => navigate('profile', comment.user_id)}
                  className="font-semibold text-sm text-slate-900 hover:underline"
                >
                  {comment.profile?.display_name || comment.profile?.username}
                </button>
                <div className="text-sm text-slate-700 leading-relaxed">
                  <RichText text={comment.content} onMentionClick={(u) => navigate('profile', u)} />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-1 ml-2 text-xs text-slate-400">
                <span>{timeAgo(comment.created_at)}</span>
                <button
                  onClick={() => handleLikeComment(comment)}
                  className={`font-semibold hover:text-rose-500 ${comment.liked_by_me ? 'text-rose-500' : ''}`}
                >
                  {formatCount(comment.like_count || 0)} likes
                </button>
                <button
                  onClick={() => setReplyingTo(comment)}
                  className="font-semibold hover:text-sky-500"
                >
                  Reply
                </button>
                {comment.user_id === profile?.id && (
                  <button onClick={() => handleDeleteComment(comment)} className="font-semibold hover:text-rose-500">
                    Delete
                  </button>
                )}
              </div>

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="mt-3 space-y-3 ml-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="flex gap-2.5 animate-fade-in">
                      <Avatar profile={reply.profile!} size="xs" onClick={() => navigate('profile', reply.user_id)} />
                      <div className="flex-1 min-w-0">
                        <div className="bg-slate-50 rounded-2xl px-3.5 py-2">
                          <button
                            onClick={() => navigate('profile', reply.user_id)}
                            className="font-semibold text-xs text-slate-900 hover:underline"
                          >
                            {reply.profile?.display_name || reply.profile?.username}
                          </button>
                          <div className="text-sm text-slate-700 leading-relaxed">
                            <RichText text={reply.content} onMentionClick={(u) => navigate('profile', u)} />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 ml-1 text-xs text-slate-400">
                          <span>{timeAgo(reply.created_at)}</span>
                          <button
                            onClick={() => handleLikeComment(reply)}
                            className={`font-semibold hover:text-rose-500 ${reply.liked_by_me ? 'text-rose-500' : ''}`}
                          >
                            {formatCount(reply.like_count || 0)} likes
                          </button>
                          {reply.user_id === profile?.id && (
                            <button onClick={() => handleDeleteComment(reply)} className="font-semibold hover:text-rose-500">
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input */}
              {replyingTo?.id === comment.id && (
                <div className="mt-3 flex items-center gap-2 animate-fade-in">
                  <CornerDownRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to ${comment.profile?.username}...`}
                    className="input-field text-sm py-2"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && replyText.trim()) handleSubmitReply(comment);
                      if (e.key === 'Escape') { setReplyingTo(null); setReplyText(''); }
                    }}
                  />
                  <button
                    onClick={() => replyText.trim() && handleSubmitReply(comment)}
                    className="text-sky-600 font-medium text-sm px-2"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Comment input */}
      <div className="border-t border-slate-100 p-4 flex items-center gap-3">
        {profile && <Avatar profile={profile} size="sm" />}
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="input-field text-sm py-2 flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newComment.trim()) handleSubmitComment();
          }}
        />
        <button
          onClick={handleSubmitComment}
          disabled={!newComment.trim()}
          className="text-sky-600 font-semibold text-sm disabled:opacity-40"
        >
          Post
        </button>
      </div>
    </div>
  );
}
