import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { uploadFile } from '@/lib/utils';
import { notifyMentions } from '@/lib/notifications';
import { Camera, Loader2, X } from 'lucide-react';

interface CreateStoryProps {
  onDone: () => void;
}

export default function CreateStory({ onDone }: CreateStoryProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleSubmit = async () => {
    if (!profile || !file) return;

    setLoading(true);
    try {
      const result = await uploadFile('stories', file, profile.id);
      if (!result) throw new Error('Upload failed');

      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

      const { data, error } = await supabase
        .from('stories')
        .insert({
          media_url: result.url,
          media_type: mediaType,
          caption: caption.trim(),
        })
        .select('id')
        .single();

      if (error) throw error;

      if (caption.trim()) {
        await notifyMentions(caption.trim(), profile.id, 'mention_story', undefined, undefined, data.id);
      }

      showToast('Story shared!', 'success');
      onDone();
    } catch (err) {
      console.error(err);
      showToast('Failed to create story', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      {preview ? (
        <div className="relative rounded-xl overflow-hidden bg-black">
          {file?.type.startsWith('video/') ? (
            <video src={preview} className="w-full max-h-80 object-contain" controls />
          ) : (
            <img src={preview} className="w-full max-h-80 object-contain" />
          )}
          <button
            onClick={() => { setFile(null); setPreview(null); }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-xl py-12 flex flex-col items-center gap-2 text-slate-400 hover:border-amber-400 hover:text-amber-500 transition-colors"
        >
          <Camera className="w-10 h-10" />
          <span className="text-sm font-medium">Select a photo or video</span>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFile}
      />

      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add a caption... Use @ to mention"
        className="input-field"
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !file}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Share Story
      </button>

      <p className="text-xs text-slate-400 text-center">Stories expire after 24 hours.</p>
    </div>
  );
}
