import { supabase } from '@/lib/supabase';

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function getAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export function getMediaUrl(bucket: string, path: string): string {
  if (path.startsWith('http')) return path;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-z0-9_]+)/gi);
  return matches ? matches.map(m => m.slice(1).toLowerCase()) : [];
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#([a-z0-9_]+)/gi);
  return matches ? matches.map(m => m.slice(1).toLowerCase()) : [];
}

export function renderText(text: string): { type: 'text' | 'mention' | 'hashtag' | 'url'; value: string }[] {
  const parts: { type: 'text' | 'mention' | 'hashtag' | 'url'; value: string }[] = [];
  const regex = /(@[a-z0-9_]+|#[a-z0-9_]+|https?:\/\/[^\s]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const value = match[0];
    if (value.startsWith('@')) {
      parts.push({ type: 'mention', value });
    } else if (value.startsWith('#')) {
      parts.push({ type: 'hashtag', value });
    } else {
      parts.push({ type: 'url', value });
    }
    lastIndex = match.index + value.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts;
}

export async function uploadFile(
  bucket: string,
  file: File,
  userId: string
): Promise<{ path: string; url: string } | null> {
  const ext = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return { path: fileName, url: data.publicUrl };
}
