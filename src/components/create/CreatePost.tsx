import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { uploadFile } from '@/lib/utils';
import { notifyMentions } from '@/lib/notifications';
import { ImagePlus, Loader2, X } from 'lucide-react';

interface CreatePostProps {
  onDone: () => void;
}

export default function CreatePost({ onDone }: CreatePostProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    if (selected.length > 10) {
      showToast('Maximum 10 images per post', 'error');
      return;
    }
    setFiles(selected);
    setPreviews(selected.map(f => URL.createObjectURL(f)));
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!profile) return;
    if (files.length === 0 && !caption.trim()) {
      showToast('Add a photo or caption', 'error');
      return;
    }

    setLoading(true);
    try {
      const mediaUrls: string[] = [];
      const mediaPaths: string[] = [];
      let mediaType = 'image';

      for (const file of files) {
        if (file.type.startsWith('video/')) mediaType = 'video';
        const result = await uploadFile('posts', file, profile.id);
        if (result) {
          mediaUrls.push(result.url);
          mediaPaths.push(result.path);
        }
      }

      const { data, error } = await supabase
        .from('posts')
        .insert({
          caption: caption.trim(),
          media_urls: mediaUrls,
          media_type: mediaType,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (caption.trim()) {
        await notifyMentions(caption.trim(), profile.id, 'mention_post', data.id);
      }

      showToast('Post shared!', 'success');
      onDone();
    } catch (err) {
      console.error(err);
      showToast('Failed to create post', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        {profile && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-400 to-blue-600 text-white text-xs font-semibold flex items-center justify-center">
            {(profile.display_name || profile.username).slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-slate-700">{profile?.username}</span>
      </div>

      {previews.length > 0 ? (
        <div className="relative rounded-xl overflow-hidden bg-slate-900">
          <div className="flex overflow-x-auto no-scrollbar">
            {previews.map((preview, i) => (
              <div key={i} className="relative flex-shrink-0">
                {files[i].type.startsWith('video/') ? (
                  <video src={preview} className="w-full max-h-80 object-contain" controls />
                ) : (
                  <img src={preview} className="w-full max-h-80 object-contain" />
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-xl py-12 flex flex-col items-center gap-2 text-slate-400 hover:border-sky-400 hover:text-sky-500 transition-colors"
        >
          <ImagePlus className="w-10 h-10" />
          <span className="text-sm font-medium">Select photos or videos</span>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      {previews.length > 0 && (
        <button
          onClick={() => fileRef.current?.click()}
          className="text-sm text-sky-600 font-medium hover:text-sky-700"
        >
          Add more
        </button>
      )}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Write a caption... Use @ to mention, # for hashtags"
        className="input-field resize-none min-h-[100px]"
        maxLength={2200}
      />

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{caption.length}/2200</span>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Share Post
      </button>
    </div>
  );
}
