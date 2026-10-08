import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { useToast } from '@/context/ToastContext';
import { Profile, Post, Reel, Save } from '@/types';
import { formatCount } from '@/lib/utils';
import { createNotification } from '@/lib/notifications';
import Avatar from '@/components/Avatar';
import Modal from '@/components/Modal';
import PostCard from '@/components/PostCard';
import RichText from '@/components/RichText';
import { Settings, Grid3x3, Film, Bookmark, UserCheck, MessageCircle, Camera, Loader2, ArrowLeft, Tag } from 'lucide-react';

interface ProfilePageProps {
  userId: string | null;
}

type Tab = 'posts' | 'reels' | 'saved' | 'tagged';

export default function ProfilePage({ userId }: ProfilePageProps) {
  const { profile: currentUser } = useAuth();
  const { navigate } = useNav();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<Tab>('posts');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ display_name: '', bio: '' });

  const targetId = userId || currentUser?.id;
  const isOwn = targetId === currentUser?.id;

  const fetchProfile = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    if (!profileData) {
      setLoading(false);
      return;
    }

    setProfile(profileData as Profile);
    setEditForm({
      display_name: profileData.display_name || '',
      bio: profileData.bio || '',
    });

    // Counts
    const [{ count: followers }, { count: following }] = await Promise.all([
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', targetId),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', targetId),
    ]);

    setFollowersCount(followers || 0);
    setFollowingCount(following || 0);

    // Check if current user follows this profile
    if (currentUser && !isOwn) {
      const { data: followData } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUser.id)
        .eq('following_id', targetId)
        .maybeSingle();
      setIsFollowing(!!followData);
    }

    // Fetch posts
    const { data: postsData } = await supabase
      .from('posts')
      .select(`*, profile:profiles!posts_user_id_fkey(*), original_profile:profiles!posts_original_user_id_fkey(*)`)
      .eq('user_id', targetId)
      .order('created_at', { ascending: false });

    if (postsData) {
      const postIds = postsData.map(p => p.id);
      let likeMap = new Map<string, number>();
      let myLikeSet = new Set<string>();
      let mySaveSet = new Set<string>();
      let commentMap = new Map<string, number>();

      if (currentUser) {
        const [{ data: likes }, { data: myLikes }, { data: saves }, { data: commentCounts }] = await Promise.all([
          supabase.from('post_likes').select('post_id').in('post_id', postIds),
          supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', currentUser.id),
          supabase.from('saves').select('post_id').in('post_id', postIds).eq('user_id', currentUser.id),
          supabase.from('comments').select('post_id').in('post_id', postIds),
        ]);
        for (const l of likes || []) likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1);
        myLikeSet = new Set((myLikes || []).map(l => l.post_id));
        mySaveSet = new Set((saves || []).map(s => s.post_id));
        for (const c of commentCounts || []) commentMap.set(c.post_id, (commentMap.get(c.post_id) || 0) + 1);
      }

      setPosts(postsData.map(p => ({
        ...p,
        profile: p.profile as any,
        original_profile: p.original_profile as any,
        like_count: likeMap.get(p.id) || 0,
        comment_count: commentMap.get(p.id) || 0,
        liked_by_me: myLikeSet.has(p.id),
        saved_by_me: mySaveSet.has(p.id),
      })));
    }

    // Fetch reels
    const { data: reelsData } = await supabase
      .from('reels')
      .select(`*, profile:profiles!reels_user_id_fkey(*)`)
      .eq('user_id', targetId)
      .order('created_at', { ascending: false });

    if (reelsData) {
      setReels(reelsData.map(r => ({ ...r, profile: r.profile as any })));
    }

    // Fetch saved posts (own profile only)
    if (isOwn && currentUser) {
      const { data: savesData } = await supabase
        .from('saves')
        .select(`post:posts(*, profile:profiles!posts_user_id_fkey(*))`)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (savesData) {
        const savedFormatted = savesData
          .filter((s: any) => s.post)
          .map((s: any) => ({
            ...s.post,
            profile: s.post.profile as any,
            saved_by_me: true,
          })) as Post[];
        setSavedPosts(savedFormatted);
      }
    }

    setLoading(false);
  }, [targetId, currentUser?.id, isOwn]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Realtime follow updates
  useEffect(() => {
    if (!targetId) return;
    const channel = supabase
      .channel(`profile-${targetId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'follows', filter: `following_id=eq.${targetId}` }, () => {
        setFollowersCount(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'follows', filter: `following_id=eq.${targetId}` }, () => {
        setFollowersCount(prev => Math.max(0, prev - 1));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `user_id=eq.${targetId}` }, () => fetchProfile())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts', filter: `user_id=eq.${targetId}` }, () => fetchProfile())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [targetId, fetchProfile]);

  const handleFollow = async () => {
    if (!currentUser || !profile) return;
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', profile.id);
      setIsFollowing(false);
      setFollowersCount(prev => Math.max(0, prev - 1));
    } else {
      await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: profile.id });
      setIsFollowing(true);
      setFollowersCount(prev => prev + 1);
      await createNotification({
        recipient_id: profile.id,
        actor_id: currentUser.id,
        type: 'follow',
        text: `@${currentUser.username} started following you.`,
      });
    }
  };

  const handleEditSave = async () => {
    if (!currentUser || !profile) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: editForm.display_name.trim() || profile.username,
        bio: editForm.bio.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.id);

    if (error) {
      showToast('Failed to update profile', 'error');
      return;
    }
    showToast('Profile updated', 'success');
    setEditing(false);
    fetchProfile();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser || !profile) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop();
    const path = `${currentUser.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file);
    if (uploadError) {
      showToast('Failed to upload photo', 'error');
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', currentUser.id);
    if (error) {
      showToast('Failed to update photo', 'error');
      return;
    }

    showToast('Profile photo updated', 'success');
    fetchProfile();
  };

  const handleMessage = async () => {
    if (!currentUser || !profile) return;
    navigate('messages', profile.id);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400">User not found.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Grid3x3 }[] = [
    { key: 'posts', label: 'Posts', icon: Grid3x3 },
    { key: 'reels', label: 'Reels', icon: Film },
    { key: 'saved', label: 'Saved', icon: Bookmark },
    { key: 'tagged', label: 'Tagged', icon: Tag },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Mobile back button */}
      {userId && userId !== currentUser?.id && (
        <button onClick={() => navigate('home')} className="md:hidden mb-4 flex items-center gap-2 text-slate-600">
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
      )}

      {/* Profile header */}
      <div className="card p-6 mb-4">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* Avatar with upload for own profile */}
          <div className="relative">
            <Avatar profile={profile} size="2xl" />
            {isOwn && (
              <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center cursor-pointer shadow-md border-2 border-white hover:bg-sky-600 transition-colors">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </label>
            )}
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{profile.display_name || profile.username}</h1>
                <p className="text-sm text-slate-400">@{profile.username}</p>
              </div>

              <div className="flex gap-2 md:ml-auto">
                {isOwn ? (
                  <>
                    <button onClick={() => setEditing(true)} className="btn-secondary text-sm">
                      <Settings className="w-4 h-4 inline mr-1" /> Edit Profile
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleFollow}
                      className={`px-5 py-2 rounded-xl font-semibold text-sm transition-all active:scale-95 ${
                        isFollowing
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700'
                      }`}
                    >
                      {isFollowing ? (
                        <span className="flex items-center gap-1.5"><UserCheck className="w-4 h-4" /> Following</span>
                      ) : (
                        'Follow'
                      )}
                    </button>
                    <button onClick={handleMessage} className="btn-secondary text-sm">
                      <MessageCircle className="w-4 h-4 inline mr-1" /> Message
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex justify-center md:justify-start gap-6 mb-3">
              <div>
                <span className="font-bold text-slate-900">{formatCount(posts.length)}</span>
                <span className="text-sm text-slate-500 ml-1">posts</span>
              </div>
              <div>
                <span className="font-bold text-slate-900">{formatCount(followersCount)}</span>
                <span className="text-sm text-slate-500 ml-1">followers</span>
              </div>
              <div>
                <span className="font-bold text-slate-900">{formatCount(followingCount)}</span>
                <span className="text-sm text-slate-500 ml-1">following</span>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-sm text-slate-600 leading-relaxed">
                <RichText text={profile.bio} onMentionClick={(u) => navigate('profile', u)} />
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const disabled = t.key === 'saved' && !isOwn;
          return (
            <button
              key={t.key}
              onClick={() => !disabled && setTab(t.key)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'posts' && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-slate-400 text-sm">{isOwn ? 'No posts yet. Share your first post!' : 'No posts yet.'}</p>
            </div>
          ) : (
            posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onDelete={(id) => setPosts(prev => prev.filter(p => p.id !== id))}
              />
            ))
          )}
        </div>
      )}

      {tab === 'reels' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {reels.length === 0 ? (
            <div className="col-span-full card p-12 text-center">
              <p className="text-slate-400 text-sm">{isOwn ? 'No reels yet. Share your first reel!' : 'No reels yet.'}</p>
            </div>
          ) : (
            reels.map(reel => (
              <button
                key={reel.id}
                onClick={() => navigate('reels', reel.id)}
                className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-900 group"
              >
                <video src={reel.video_url} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-2 left-2 right-2 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="truncate">{reel.caption || 'Reel'}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'saved' && isOwn && (
        <div className="space-y-4">
          {savedPosts.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-slate-400 text-sm">No saved posts yet.</p>
            </div>
          ) : (
            savedPosts.map(post => <PostCard key={post.id} post={post} />)
          )}
        </div>
      )}

      {tab === 'tagged' && (
        <div className="card p-12 text-center">
          <p className="text-slate-400 text-sm">No tagged content yet.</p>
        </div>
      )}

      {/* Edit modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Profile">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Display Name</label>
            <input
              value={editForm.display_name}
              onChange={(e) => setEditForm(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder="Your display name"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Bio</label>
            <textarea
              value={editForm.bio}
              onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="Tell people about yourself..."
              className="input-field resize-none min-h-[80px]"
              maxLength={150}
            />
            <div className="text-xs text-slate-400 mt-1">{editForm.bio.length}/150</div>
          </div>
          <button onClick={handleEditSave} className="btn-primary w-full">
            Save Changes
          </button>
        </div>
      </Modal>
    </div>
  );
}
