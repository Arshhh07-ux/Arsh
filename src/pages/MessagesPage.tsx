import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Conversation, Message, Profile } from '@/types';
import { timeAgo } from '@/lib/utils';
import { createNotification } from '@/lib/notifications';
import Avatar from '@/components/Avatar';
import RichText from '@/components/RichText';
import { Search, Send, ArrowLeft, Smile, Trash2, Image as ImageIcon, X, MessageSquare, CheckCheck, Reply } from 'lucide-react';

interface MessagesPageProps {
  startUserId?: string;
}

const EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢', '👏', '🎉'];
const PRESENCE_CHANNEL = 'socialx-presence';

export default function MessagesPage({ startUserId }: MessagesPageProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, boolean>>(new Map());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Presence: track online status
  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: profile.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const online = new Set<string>();
        Object.keys(state).forEach(key => online.add(key));
        setOnlineUsers(online);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: profile.id, online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data: participations } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        last_read_at,
        conversation:conversations(
          id, created_at,
          participants:conversation_participants(
            id, user_id, last_read_at,
            profile:profiles(*)
          )
        )
      `)
      .eq('user_id', profile.id);

    if (!participations) { setLoading(false); return; }

    const convs: Conversation[] = [];
    for (const p of participations) {
      const conv = p.conversation as any;
      if (!conv) continue;
      const otherParticipant = conv.participants?.find((pp: any) => pp.user_id !== profile.id);
      if (!otherParticipant) continue;

      // Get last message
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(*)')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Count unread
      const { count: unread } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', profile.id)
        .gt('created_at', p.last_read_at);

      convs.push({
        id: conv.id,
        created_at: conv.created_at,
        other_participant: otherParticipant.profile as Profile,
        last_message: lastMsg as any,
        unread_count: unread || 0,
      });
    }

    convs.sort((a, b) => {
      const aTime = a.last_message?.created_at || a.created_at;
      const bTime = b.last_message?.created_at || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setConversations(convs);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime: new messages update conversation list
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchConversations())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => fetchConversations())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => fetchConversations())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants' }, () => fetchConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations, profile?.id]);

  // Start conversation with a specific user (from startUserId prop)
  useEffect(() => {
    if (!startUserId || !profile) return;
    (async () => {
      await startConversationWithUser(startUserId);
    })();
  }, [startUserId, profile?.id]);

  const startConversationWithUser = async (userId: string) => {
    if (!profile) return;
    // Check if conversation already exists
    const existing = conversations.find(c => c.other_participant?.id === userId);
    if (existing) {
      setActiveConv(existing);
      return;
    }

    // Create new conversation
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({})
      .select('id')
      .single();
    if (!newConv) return;

    await supabase.from('conversation_participants').insert([
      { conversation_id: newConv.id, user_id: profile.id },
      { conversation_id: newConv.id, user_id: userId },
    ]);

    // Fetch the other user's profile
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const conv: Conversation = {
      id: newConv.id,
      created_at: new Date().toISOString(),
      other_participant: otherProfile as Profile,
      unread_count: 0,
    };
    setActiveConv(conv);
    fetchConversations();
  };

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async () => {
    if (!activeConv || !profile) return;
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(*),
        reply_to:messages!messages_reply_to_id_fkey(*),
        shared_post:posts!messages_shared_post_id_fkey(*, profile:profiles!posts_user_id_fkey(*)),
        shared_reel:reels!messages_shared_reel_id_fkey(*, profile:profiles!reels_user_id_fkey(*))
      `)
      .eq('conversation_id', activeConv.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error || !data) return;

    const formatted: Message[] = data.map(m => ({
      ...m,
      sender: m.sender as any,
      reply_to: m.reply_to as any,
      shared_post: m.shared_post as any,
      shared_reel: m.shared_reel as any,
    }));

    setMessages(formatted);

    // Mark as read
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', activeConv.id)
      .eq('user_id', profile.id);

    // Update unread count for this conversation
    setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, unread_count: 0 } : c));
  }, [activeConv, profile?.id]);

  useEffect(() => {
    if (activeConv) {
      fetchMessages();
    }
  }, [fetchMessages]);

  // Realtime: messages in active conversation
  useEffect(() => {
    if (!activeConv) return;
    const channel = supabase
      .channel(`messages-${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`
      }, () => fetchMessages())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`
      }, () => fetchMessages())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`
      }, () => fetchMessages())
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'message_reactions'
      }, () => fetchMessages())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'message_reactions'
      }, () => fetchMessages())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConv, fetchMessages]);

  // Typing indicator via presence
  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`typing-${profile.id}`);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typingMap = new Map<string, boolean>();
        Object.entries(state).forEach(([key, presences]) => {
          presences.forEach((p: any) => {
            if (p.isTyping && p.conversationId) {
              typingMap.set(p.conversationId, true);
            }
          });
        });
        setTypingUsers(typingMap);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: profile.id, isTyping: false, conversationId: null });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  const sendTypingStatus = async (isTyping: boolean) => {
    if (!profile || !activeConv) return;
    const channel = supabase.channel(`typing-${activeConv.other_participant?.id}`);
    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: profile.id,
          isTyping,
          conversationId: activeConv.id,
        });
      }
    });
  };

  const handleMessageInput = (value: string) => {
    setNewMessage(value);
    if (value.trim()) {
      sendTypingStatus(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTypingStatus(false), 2000);
    } else {
      sendTypingStatus(false);
    }
  };

  const handleSendMessage = async () => {
    if (!profile || !activeConv || !newMessage.trim()) return;

    const msgData: any = {
      conversation_id: activeConv.id,
      sender_id: profile.id,
      content: newMessage.trim(),
      reply_to_id: replyTo?.id || null,
    };

    const { error } = await supabase.from('messages').insert(msgData);
    if (error) {
      showToast('Failed to send message', 'error');
      return;
    }

    // Notify recipient
    if (activeConv.other_participant) {
      await createNotification({
        recipient_id: activeConv.other_participant.id,
        actor_id: profile.id,
        type: 'message',
        text: `@${profile.username} sent you a message.`,
        conversation_id: activeConv.id,
      });
    }

    setNewMessage('');
    setReplyTo(null);
    sendTypingStatus(false);
    fetchMessages();
    fetchConversations();
  };

  const handleSendMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || !activeConv) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop();
    const path = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('messages').upload(path, file);
    if (uploadError) { showToast('Upload failed', 'error'); return; }

    const { data } = supabase.storage.from('messages').getPublicUrl(path);
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

    await supabase.from('messages').insert({
      conversation_id: activeConv.id,
      sender_id: profile.id,
      media_url: data.publicUrl,
      media_type: mediaType,
    });

    if (activeConv.other_participant) {
      await createNotification({
        recipient_id: activeConv.other_participant.id,
        actor_id: profile.id,
        type: 'message',
        text: `@${profile.username} sent you a message.`,
        conversation_id: activeConv.id,
      });
    }

    fetchMessages();
    fetchConversations();
  };

  const handleReaction = async (message: Message, emoji: string) => {
    if (!profile) return;
    const existing = message.reactions?.find(r => r.user_id === profile.id && r.emoji === emoji);
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('message_reactions').insert({
        message_id: message.id,
        user_id: profile.id,
        emoji,
      });
    }
    fetchMessages();
  };

  const handleUnsend = async (message: Message) => {
    if (!profile || message.sender_id !== profile.id) return;
    await supabase.from('messages').update({ deleted_at: new Date().toISOString(), content: null, media_url: null }).eq('id', message.id);
    showToast('Message unsent', 'success');
    fetchMessages();
  };

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', profile?.id || '')
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(20);
      if (data) setSearchResults(data as Profile[]);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, profile?.id]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-screen">
      {/* Conversation list */}
      <div className={`${activeConv ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r border-slate-200 bg-white`}>
        <div className="p-4 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900 mb-3">Messages</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(!!e.target.value.trim()); }}
              placeholder="Search users..."
              className="input-field pl-10 text-sm py-2"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {showSearch ? (
            <div>
              {searchResults.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-8">No users found</div>
              ) : (
                searchResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => { startConversationWithUser(user.id); setShowSearch(false); setSearchQuery(''); }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <Avatar profile={user} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{user.display_name || user.username}</div>
                      <div className="text-xs text-slate-400">@{user.username}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No conversations yet.</p>
              <p className="text-xs text-slate-400 mt-1">Search for users to start chatting.</p>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left ${
                  activeConv?.id === conv.id ? 'bg-sky-50' : ''
                }`}
              >
                <div className="relative">
                  <Avatar profile={conv.other_participant!} size="md" />
                  {onlineUsers.has(conv.other_participant!.id) && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 truncate">{conv.other_participant?.display_name || conv.other_participant?.username}</span>
                    {conv.last_message && (
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-2">{timeAgo(conv.last_message.created_at)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 truncate">
                      {conv.last_message?.deleted_at ? 'Message unsent'
                        : conv.last_message?.media_url ? 'Photo'
                        : conv.last_message?.shared_post_id ? 'Shared post'
                        : conv.last_message?.shared_reel_id ? 'Shared reel'
                        : conv.last_message?.content || 'Start chatting'}
                    </span>
                    {(conv.unread_count || 0) > 0 && (
                      <span className="ml-2 bg-sky-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
                        {conv.unread_count! > 99 ? '99+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      {activeConv ? (
        <div className="flex-1 flex flex-col bg-white">
          {/* Chat header */}
          <div className="flex items-center gap-3 p-3 border-b border-slate-100">
            <button onClick={() => setActiveConv(null)} className="md:hidden p-1">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="relative">
              <Avatar profile={activeConv.other_participant!} size="md" />
              {onlineUsers.has(activeConv.other_participant!.id) && (
                <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm text-slate-900">{activeConv.other_participant?.display_name || activeConv.other_participant?.username}</div>
              <div className="text-xs text-slate-400">
                {typingUsers.get(activeConv.id) ? (
                  <span className="text-sky-500">Typing...</span>
                ) : onlineUsers.has(activeConv.other_participant!.id) ? (
                  'Active now'
                ) : (
                  'Offline'
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Avatar profile={activeConv.other_participant!} size="xl" />
                <p className="mt-3 font-semibold text-slate-700">{activeConv.other_participant?.display_name || activeConv.other_participant?.username}</p>
                <p className="text-sm text-slate-400 mt-1">Send a message to start the conversation.</p>
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.sender_id === profile?.id;
                const showCheck = isMe && !msg.deleted_at;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
                    <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                      {/* Reply context */}
                      {msg.reply_to && !msg.deleted_at && (
                        <div className={`text-xs text-slate-400 px-3 py-1 rounded-t-lg bg-slate-100 border-l-2 border-sky-400 mb-0.5`}>
                          {msg.reply_to.content || (msg.reply_to.media_url ? 'Photo' : 'Message')}
                        </div>
                      )}

                      {/* Shared post preview */}
                      {msg.shared_post && !msg.deleted_at && (
                        <div className={`mb-1 card p-3 max-w-[250px] ${isMe ? 'ml-auto' : ''}`}>
                          {msg.shared_post.media_urls?.[0] && (
                            <img src={msg.shared_post.media_urls[0]} className="w-full h-32 object-cover rounded-lg mb-2" />
                          )}
                          <p className="text-xs text-slate-600 line-clamp-2">{msg.shared_post.caption || 'Shared post'}</p>
                          <p className="text-xs text-slate-400 mt-1">@{msg.shared_post.profile?.username}</p>
                        </div>
                      )}

                      {/* Shared reel preview */}
                      {msg.shared_reel && !msg.deleted_at && (
                        <div className={`mb-1 card p-3 max-w-[250px] ${isMe ? 'ml-auto' : ''}`}>
                          <video src={msg.shared_reel.video_url} className="w-full h-32 object-cover rounded-lg mb-2" />
                          <p className="text-xs text-slate-600 line-clamp-2">{msg.shared_reel.caption || 'Shared reel'}</p>
                          <p className="text-xs text-slate-400 mt-1">@{msg.shared_reel.profile?.username}</p>
                        </div>
                      )}

                      {/* Message bubble */}
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-sm relative ${
                          msg.deleted_at
                            ? 'bg-slate-100 text-slate-400 italic'
                            : isMe
                            ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white'
                            : 'bg-white border border-slate-100 text-slate-700'
                        }`}
                      >
                        {msg.deleted_at ? (
                          'Message unsent'
                        ) : msg.media_url ? (
                          msg.media_type === 'video' ? (
                            <video src={msg.media_url} className="rounded-lg max-w-[250px]" controls />
                          ) : (
                            <img src={msg.media_url} className="rounded-lg max-w-[250px]" />
                          )
                        ) : (
                          <RichText text={msg.content || ''} />
                        )}

                        {/* Reactions */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="absolute -bottom-3 left-1 flex gap-0.5 bg-white rounded-full shadow-md px-1 py-0.5 border border-slate-100">
                            {msg.reactions.map(r => (
                              <span key={r.id} className="text-xs">{r.emoji}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Timestamp and status */}
                      <div className={`flex items-center gap-1 mt-1 text-xs text-slate-400 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span>{timeAgo(msg.created_at)}</span>
                        {showCheck && (
                          <CheckCheck className="w-3.5 h-3.5 text-sky-500" />
                        )}
                        {/* Quick actions on hover */}
                        {!msg.deleted_at && (
                          <div className="hidden group-hover:flex items-center gap-1 ml-1">
                            <button
                              onClick={() => setReplyTo(msg)}
                              className="p-0.5 hover:text-sky-500"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setShowEmojiFor(msg.id === showEmojiFor ? null : msg.id); }}
                              className="p-0.5 hover:text-sky-500"
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                            {isMe && (
                              <button onClick={() => handleUnsend(msg)} className="p-0.5 hover:text-rose-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Emoji picker */}
                      {showEmojiFor === msg.id && (
                        <div className={`flex gap-1 mt-1 p-1.5 bg-white rounded-full shadow-md border border-slate-100 ${isMe ? 'ml-auto' : ''}`}>
                          {EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => { handleReaction(msg, emoji); setShowEmojiFor(null); }}
                              className="text-lg hover:scale-125 transition-transform"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply banner */}
          {replyTo && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
              <Reply className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-500 flex-1 truncate">
                Replying to: {replyTo.content || (replyTo.media_url ? 'Photo' : 'Message')}
              </span>
              <button onClick={() => setReplyTo(null)} className="p-1">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-100 flex items-center gap-2">
            <label className="cursor-pointer p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <ImageIcon className="w-5 h-5 text-slate-500" />
              <input type="file" accept="image/*,video/*" className="hidden" onChange={handleSendMedia} />
            </label>
            <input
              value={newMessage}
              onChange={(e) => handleMessageInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              placeholder="Type a message..."
              className="input-field flex-1 text-sm py-2"
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white flex items-center justify-center disabled:opacity-40 transition-all active:scale-90"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400">Select a conversation to start messaging.</p>
          </div>
        </div>
      )}
    </div>
  );
}
