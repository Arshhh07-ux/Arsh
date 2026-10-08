import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { Profile, Post, Reel } from '@/types';
import Avatar from '@/components/Avatar';
import PostCard from '@/components/PostCard';
import RichText from '@/components/RichText';
import { Search as SearchIcon, Hash, X, Loader2, UserCheck } from 'lucide-react';
import { createNotification } from '@/lib/notifications';

export default function SearchPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'users' | 'hashtags' | 'posts' | 'reels'>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [hashtags, setHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [followMap, setFollowMap] = useState<Map<string, boolean>>(new Map());

  const search = useCallback(async () => {
    if (!query.trim()) {
      setUsers([]);
      setPosts([]);
      setReels([]);
      setHashtags([]);
      return;
    }

    setLoading(true);
    const q = query.trim();

    if (tab === 'users') {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', profile?.id || '')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(30);
      setUsers(data as Profile[] || []);

      // Check follow status
      if (profile && data && data.length > 0) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', profile.id)
          .in('following_id', data.map(u => u.id));
        const map = new Map<string, boolean>();
        for (const f of follows || []) map.set(f.following_id, true);
        setFollowMap(map);
      }
    } else if (tab === 'hashtags') {
      const { data } = await supabase
        .from('posts')
        .select('caption')
        .ilike('caption', `%#${q}%`)
        .limit(100);
      const tagCounts = new Map<string, number>();
      const tagRegex = new RegExp(`#${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-z0-9_]*)`, 'gi');
      for (const post of data || []) {
        const matches = post.caption?.match(/#[a-z0-9_]+/gi) || [];
        for (const m of matches) {
          const tag = m.slice(1).toLowerCase();
          if (tag.startsWith(q.toLowerCase())) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          }
        }
      }
      setHashtags(Array.from(tagCounts.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count));
    } else if (tab === 'posts') {
      const { data } = await supabase
        .from('posts')
        .select(`*, profile:profiles!posts_user_id_fkey(*), original_profile:profiles!posts_original_user_id_fkey(*)`)
        .or(`caption.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (data) {
        const postIds = data.map(p => p.id);
        let likeMap = new Map<string, number>();
        let commentMap = new Map<string, number>();
        if (profile) {
          const [{ data: likes }, { data: comments }] = await Promise.all([
            supabase.from('post_likes').select('post_id').in('post_id', postIds),
            supabase.from('comments').select('post_id').in('post_id', postIds),
          ]);
          for (const l of likes || []) likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1);
          for (const c of comments || []) commentMap.set(c.post_id, (commentMap.get(c.post_id) || 0) + 1);
        }
        setPosts(data.map(p => ({
          ...p,
          profile: p.profile as any,
          original_profile: p.original_profile as any,
          like_count: likeMap.get(p.id) || 0,
          comment_count: commentMap.get(p.id) || 0,
        })));
      }
    } else if (tab === 'reels') {
      const { data } = await supabase
        .from('reels')
        .select(`*, profile:profiles!reels_user_id_fkey(*)`)
        .ilike('caption', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (data) {
        setReels(data.map(r => ({ ...r, profile: r.profile as any })));
      }
    }

    setLoading(false);
  }, [query, tab, profile?.id]);

  useEffect(() => {
    const timer = setTimeout(() => search(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleFollow = async (userId: string) => {
    if (!profile) return;
    const isFollowing = followMap.get(userId);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', profile.id).eq('following_id', userId);
      setFollowMap(prev => { const m = new Map(prev); m.set(userId, false); return m; });
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: userId });
      setFollowMap(prev => { const m = new Map(prev); m.set(userId, true); return m; });
      await createNotification({
        recipient_id: userId,
        actor_id: profile.id,
        type: 'follow',
        text: `@${profile.username} started following you.`,
      });
    }
  };

  const tabs = [
    { key: 'users' as const, label: 'People' },
    { key: 'hashtags' as const, label: 'Tags' },
    { key: 'posts' as const, label: 'Posts' },
    { key: 'reels' as const, label: 'Reels' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Search</h1>

      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, hashtags, posts, reels..."
          className="input-field pl-11 pr-10"
          autoFocus
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : !query.trim() ? (
        <div className="card p-12 text-center">
          <SearchIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Start typing to search.</p>
        </div>
      ) : tab === 'users' ? (
        <div className="space-y-1">
          {users.length === 0 ? (
            <div className="card p-8 text-center text-slate-400 text-sm">No users found.</div>
          ) : (
            users.map(user => (
              <div key={user.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                <Avatar profile={user} size="md" onClick={() => navigate('profile', user.id)} />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate('profile', user.id)}>
                  <div className="text-sm font-medium text-slate-900 truncate">{user.display_name || user.username}</div>
                  <div className="text-xs text-slate-400">@{user.username}</div>
                  {user.bio && <div className="text-xs text-slate-500 mt-0.5 truncate"><RichText text={user.bio} /></div>}
                </div>
                {profile && profile.id !== user.id && (
                  <button
                    onClick={() => handleFollow(user.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                      followMap.get(user.id)
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-sky-500 text-white hover:bg-sky-600'
                    }`}
                  >
                    {followMap.get(user.id) ? (
                      <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Following</span>
                    ) : 'Follow'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'hashtags' ? (
        <div className="space-y-1">
          {hashtags.length === 0 ? (
            <div className="card p-8 text-center text-slate-400 text-sm">No hashtags found.</div>
          ) : (
            hashtags.map(({ tag, count }) => (
              <div key={tag} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-slate-500" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900">#{tag}</div>
                  <div className="text-xs text-slate-400">{count} posts</div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'posts' ? (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="card p-8 text-center text-slate-400 text-sm">No posts found.</div>
          ) : (
            posts.map(post => <PostCard key={post.id} post={post} />)
          )}
        </div>
      ) : tab === 'reels' ? (
        <div className="grid grid-cols-2 gap-3">
          {reels.length === 0 ? (
            <div className="col-span-full card p-8 text-center text-slate-400 text-sm">No reels found.</div>
          ) : (
            reels.map(reel => (
              <button
                key={reel.id}
                onClick={() => navigate('reels', reel.id)}
                className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-900 group"
              >
                <video src={reel.video_url} className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 right-2 text-white text-xs">
                  <p className="truncate">@{reel.profile?.username}</p>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
