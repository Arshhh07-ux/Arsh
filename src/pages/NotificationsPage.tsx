import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { Notification } from '@/types';
import { timeAgo } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import { Heart, MessageCircle, Repeat2, UserPlus, AtSign, Bell, CheckCheck } from 'lucide-react';

const NOTIF_ICONS: Record<string, typeof Heart> = {
  like_post: Heart,
  like_reel: Heart,
  like_repost: Heart,
  like_story: Heart,
  comment: MessageCircle,
  reply: MessageCircle,
  repost_post: Repeat2,
  repost_reel: Repeat2,
  follow: UserPlus,
  mention_post: AtSign,
  mention_reel: AtSign,
  mention_story: AtSign,
  story_reply: MessageCircle,
  share_post: Bell,
  share_reel: Bell,
  message: MessageCircle,
};

const NOTIF_COLORS: Record<string, string> = {
  like_post: 'text-rose-500',
  like_reel: 'text-rose-500',
  like_repost: 'text-rose-500',
  like_story: 'text-rose-500',
  comment: 'text-sky-500',
  reply: 'text-sky-500',
  repost_post: 'text-emerald-500',
  repost_reel: 'text-emerald-500',
  follow: 'text-sky-500',
  mention_post: 'text-amber-500',
  mention_reel: 'text-amber-500',
  mention_story: 'text-amber-500',
  story_reply: 'text-sky-500',
  share_post: 'text-sky-500',
  share_reel: 'text-sky-500',
  message: 'text-sky-500',
};

export default function NotificationsPage() {
  const { profile } = useAuth();
  const { navigate, setUnreadNotifications } = useNav();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('notifications')
      .select(`*, actor:profiles!notifications_actor_id_fkey(*)`)
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !data) {
      setLoading(false);
      return;
    }

    const formatted = data.map(n => ({ ...n, actor: n.actor as any }));
    setNotifications(formatted);

    const unread = formatted.filter(n => !n.read).length;
    setUnreadNotifications(unread);

    setLoading(false);
  }, [profile?.id, setUnreadNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('notifications-feed')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`
      }, () => fetchNotifications())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`
      }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, fetchNotifications]);

  const handleMarkAllRead = async () => {
    if (!profile) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', profile.id)
      .eq('read', false);
    fetchNotifications();
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', notif.id);
      fetchNotifications();
    }

    // Navigate based on type
    if (notif.type === 'follow') {
      navigate('profile', notif.actor_id);
    } else if (notif.post_id) {
      navigate('home');
    } else if (notif.reel_id) {
      navigate('reels', notif.reel_id);
    } else if (notif.conversation_id) {
      navigate('messages', notif.actor_id);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 text-sm text-sky-600 font-medium hover:text-sky-700"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-1">
        {notifications.length === 0 ? (
          <div className="card p-12 text-center">
            <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No notifications yet.</p>
            <p className="text-slate-400 text-xs mt-1">When someone interacts with you, you'll see it here.</p>
          </div>
        ) : (
          notifications.map(notif => {
            const Icon = NOTIF_ICONS[notif.type] || Bell;
            const colorClass = NOTIF_COLORS[notif.type] || 'text-slate-400';
            return (
              <button
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left hover:bg-slate-50 ${
                  !notif.read ? 'bg-sky-50/50' : ''
                }`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar profile={notif.actor!} size="md" />
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center border border-slate-100`}>
                    <Icon className={`w-3 h-3 ${colorClass}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 leading-snug">{notif.text}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{timeAgo(notif.created_at)}</p>
                </div>
                {!notif.read && (
                  <div className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
