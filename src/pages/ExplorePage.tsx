import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useNav } from '@/context/NavContext';
import { Post, Reel } from '@/types';
import PostCard from '@/components/PostCard';
import { Loader2 } from 'lucide-react';

export default function ExplorePage() {
  const { navigate } = useNav();
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'feed'>('grid');

  const fetchExplore = useCallback(async () => {
    setLoading(true);

    const [{ data: postsData }, { data: reelsData }] = await Promise.all([
      supabase
        .from('posts')
        .select(`*, profile:profiles!posts_user_id_fkey(*), original_profile:profiles!posts_original_user_id_fkey(*)`)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('reels')
        .select(`*, profile:profiles!reels_user_id_fkey(*)`)
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    if (postsData) {
      const postIds = postsData.map(p => p.id);
      const { data: likes } = await supabase.from('post_likes').select('post_id').in('post_id', postIds);
      const likeMap = new Map<string, number>();
      for (const l of likes || []) likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1);

      setPosts(postsData.map(p => ({
        ...p,
        profile: p.profile as any,
        original_profile: p.original_profile as any,
        like_count: likeMap.get(p.id) || 0,
      })));
    }

    if (reelsData) {
      setReels(reelsData.map(r => ({ ...r, profile: r.profile as any })));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchExplore();

    const channel = supabase
      .channel('explore-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => fetchExplore())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, () => fetchExplore())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reels' }, () => fetchExplore())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchExplore]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Explore</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === 'grid' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            Grid
          </button>
          <button
            onClick={() => setView('feed')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === 'feed' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            Feed
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : posts.length === 0 && reels.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-slate-400 text-sm">Nothing to explore yet. Start posting!</p>
        </div>
      ) : view === 'grid' ? (
        <>
          {/* Reels row */}
          {reels.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-slate-500 mb-3">Reels</h2>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {reels.map(reel => (
                  <button
                    key={reel.id}
                    onClick={() => navigate('reels', reel.id)}
                    className="relative aspect-[9/16] w-32 flex-shrink-0 rounded-xl overflow-hidden bg-slate-900 group"
                  >
                    <video src={reel.video_url} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2 text-white text-xs truncate">
                      @{reel.profile?.username}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Posts grid */}
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Posts</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {posts.map(post => (
              <button
                key={post.id}
                onClick={() => setView('feed')}
                className="relative aspect-square rounded-xl overflow-hidden bg-slate-900 group"
              >
                {post.media_urls?.[0] ? (
                  post.media_type === 'video' ? (
                    <video src={post.media_urls[0]} className="w-full h-full object-cover" />
                  ) : (
                    <img src={post.media_urls[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4 bg-gradient-to-br from-sky-100 to-blue-100">
                    <p className="text-xs text-slate-600 text-center line-clamp-4">{post.caption}</p>
                  </div>
                )}
                {post.media_urls && post.media_urls.length > 1 && (
                  <div className="absolute top-2 right-2 text-white text-xs bg-black/40 rounded px-1.5 py-0.5">
                    {post.media_urls.length}
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          {posts.map(post => <PostCard key={post.id} post={post} />)}
        </div>
      )}
    </div>
  );
}
