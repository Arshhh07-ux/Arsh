import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';

export function useUnreadCounts() {
  const { profile } = useAuth();
  const { setUnreadMessages, setUnreadNotifications } = useNav();

  useEffect(() => {
    if (!profile) {
      setUnreadMessages(0);
      setUnreadNotifications(0);
      return;
    }

    const fetchCounts = async () => {
      // Unread messages: messages in conversations where I'm a participant,
      // where sender != me and created_at > my last_read_at
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', profile.id);

      let totalUnread = 0;
      for (const p of participations || []) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', p.conversation_id)
          .neq('sender_id', profile.id)
          .gt('created_at', p.last_read_at);
        totalUnread += count || 0;
      }
      setUnreadMessages(totalUnread);

      // Unread notifications
      const { count: notifCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', profile.id)
        .eq('read', false);
      setUnreadNotifications(notifCount || 0);
    };

    fetchCounts();

    // Realtime for notifications
    const notifChannel = supabase
      .channel('unread-notifs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`
      }, () => fetchCounts())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`
      }, () => fetchCounts())
      .subscribe();

    // Realtime for messages
    const msgChannel = supabase
      .channel('unread-msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchCounts())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants' }, () => fetchCounts())
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [profile?.id, setUnreadMessages, setUnreadNotifications]);
}
