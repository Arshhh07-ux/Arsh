import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Post } from '@/types';
import PostCard from '@/components/PostCard';
import StoriesBar from '@/components/StoriesBar';
import { Loader2, RefreshCw } from 'lucide-react';

export default function HomePage() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedType, setFeedType] = useState<'following' | 'discover'>('following');

  const fetchPosts = useCallback(async () => {
    setLoading(true);

    if (feedType === 'following' && profile) {
      // Get IDs of users the current user follows
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', profile.id);

      const followingIds = (follows || []).map(f => f.following_id);
      followingIds.push(profile.id); // Include own posts

      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profile:profiles!posts_user_id_fkey(*),
          original_profile:profiles!posts_original_user_id_fkey(*),
          original_post:posts!posts_original_post_id_fkey(*)
        `)
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Fetch like/save counts and user's interactions
      const postIds = data.map(p => p.id);
      const [{ data: likes }, { data: myLikes }, { data: saves }, { data: commentCounts }] = await Promise.all([
        supabase.from('post_likes').select('post_id').in('post_id', postIds),
        supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', profile.id),
        supabase.from('saves').select('post_id').in('post_id', postIds).eq('user_id', profile.id),
        supabase.from('comments').select('post_id').in('post_id', postIds),
      ]);

      const likeMap = new Map<string, number>();
      for (const l of likes || []) likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1);

      const myLikeSet = new Set((myLikes || []).map(l => l.post_id));
      const mySaveSet = new Set((saves || []).map(s => s.post_id));
      const commentMap = new Map<string, number>();
      for (const c of commentCounts || []) commentMap.set(c.post_id, (commentMap.get(c.post_id) || 0) + 1);

      const formatted: Post[] = data.map(p => ({
        ...p,
        profile: p.profile as any,
        original_profile: p.original_profile as any,
        like_count: likeMap.get(p.id) || 0,
        comment_count: commentMap.get(p.id) || 0,
        liked_by_me: myLikeSet.has(p.id),
        saved_by_me: mySaveSet.has(p.id),
      }));

      setPosts(formatted);
    } else {
      // Discover feed - all posts
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profile:profiles!posts_user_id_fkey(*),
          original_profile:profiles!posts_original_user_id_fkey(*)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) {
        setLoading(false);
        return;
      }

      const postIds = data.map(p => p.id);
      let likeMap = new Map<string, number>();
      let myLikeSet = new Set<string>();
      let mySaveSet = new Set<string>();
      let commentMap = new Map<string, number>();

      if (profile) {
        const [{ data: likes }, { data: myLikes }, { data: saves }, { data: commentCounts }] = await Promise.all([
          supabase.from('post_likes').select('post_id').in('post_id', postIds),
          supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', profile.id),
          supabase.from('saves').select('post_id').in('post_id', postIds).eq('user_id', profile.id),
          supabase.from('comments').select('post_id').in('post_id', postIds),
        ]);

        for (const l of likes || []) likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1);
        myLikeSet = new Set((myLikes || []).map(l => l.post_id));
        mySaveSet = new Set((saves || []).map(s => s.post_id));
        for (const c of commentCounts || []) commentMap.set(c.post_id, (commentMap.get(c.post_id) || 0) + 1);
      }

      const formatted: Post[] = data.map(p => ({
        ...p,
        profile: p.profile as any,
        original_profile: p.original_profile as any,
        like_count: likeMap.get(p.id) || 0,
        comment_count: commentMap.get(p.id) || 0,
        liked_by_me: myLikeSet.has(p.id),
        saved_by_me: mySaveSet.has(p.id),
      }));

      setPosts(formatted);
    }

    setLoading(false);
  }, [feedType, profile?.id]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Realtime: listen for new posts
  useEffect(() => {
    const channel = supabase
      .channel('home-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        // Refetch to get the new post with profile join
        fetchPosts();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, () => {
        fetchPosts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPosts]);

  const handleDelete = (id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Home</h1>
        <button
          onClick={fetchPosts}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-slate-500" />
        </button>
      </div>

      {/* Feed tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFeedType('following')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            feedType === 'following' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          Following
        </button>
        <button
          onClick={() => setFeedType('discover')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            feedType === 'discover' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          Discover
        </button>
      </div>

      <StoriesBar />

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : posts.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-slate-400 text-sm">
              {feedType === 'following'
                ? 'No posts from people you follow yet. Try the Discover feed!'
                : 'No posts yet. Be the first to share!'}
            </p>
          </div>
        ) : (
          posts.map(post => <PostCard key={post.id} post={post} onDelete={handleDelete} />)
        )}
      </div>
    </div>
  );
}
