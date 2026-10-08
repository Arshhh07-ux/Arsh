export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  caption: string;
  media_urls: string[];
  media_type: string;
  is_repost: boolean;
  original_post_id: string | null;
  original_user_id: string | null;
  quote: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  original_profile?: Profile;
  original_post?: Post;
  like_count?: number;
  comment_count?: number;
  repost_count?: number;
  liked_by_me?: boolean;
  saved_by_me?: boolean;
}

export interface Reel {
  id: string;
  user_id: string;
  caption: string;
  video_url: string;
  thumbnail_url: string | null;
  audio_title: string | null;
  is_repost: boolean;
  original_reel_id: string | null;
  original_user_id: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  original_profile?: Profile;
  original_reel?: Reel;
  like_count?: number;
  comment_count?: number;
  repost_count?: number;
  liked_by_me?: boolean;
  saved_by_me?: boolean;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string;
  created_at: string;
  expires_at: string;
  profile?: Profile;
  viewed_by_me?: boolean;
  like_count?: number;
  viewer_count?: number;
}

export interface Comment {
  id: string;
  post_id: string | null;
  reel_id: string | null;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  profile?: Profile;
  like_count?: number;
  liked_by_me?: boolean;
  replies?: Comment[];
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  created_at: string;
  participants?: ConversationParticipant[];
  other_participant?: Profile;
  last_message?: Message;
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  last_read_at: string;
  profile?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  shared_post_id: string | null;
  shared_reel_id: string | null;
  reply_to_id: string | null;
  created_at: string;
  deleted_at: string | null;
  sender?: Profile;
  reply_to?: Message;
  shared_post?: Post;
  shared_reel?: Reel;
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  profile?: Profile;
}

export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  reel_id: string | null;
  story_id: string | null;
  comment_id: string | null;
  message_id: string | null;
  conversation_id: string | null;
  text: string;
  read: boolean;
  created_at: string;
  actor?: Profile;
}

export interface Save {
  id: string;
  user_id: string;
  post_id: string | null;
  reel_id: string | null;
  created_at: string;
}
