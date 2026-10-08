import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { uploadFile } from '@/lib/utils';
import { notifyMentions } from '@/lib/notifications';
import { Film, Loader2, X } from 'lucide-react';

interface CreateReelProps {
  onDone: () => void;
}

export default function CreateReel({ onDone }: CreateReelProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [audioTitle, setAudioTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('video/')) {
      showToast('Please select a video file', 'error');
      return;
    }
    if (selected.size > 100 * 1024 * 1024) {
      showToast('Video must be under 100MB', 'error');
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleSubmit = async () => {
    if (!profile) return;
    if (!file) {
      showToast('Please select a video', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await uploadFile('reels', file, profile.id);
      if (!result) throw new Error('Upload failed');

      const { data, error } = await supabase
        .from('reels')
        .insert({
          caption: caption.trim(),
          video_url: result.url,
          audio_title: audioTitle.trim() || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (caption.trim()) {
        await notifyMentions(caption.trim(), profile.id, 'mention_reel', undefined, data.id);
      }

      showToast('Reel shared!', 'success');
      onDone();
    } catch (err) {
      console.error(err);
      showToast('Failed to create reel', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      {preview ? (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video src={preview} className="w-full max-h-80 object-contain" controls />
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
          className="w-full border-2 border-dashed border-slate-200 rounded-xl py-12 flex flex-col items-center gap-2 text-slate-400 hover:border-rose-400 hover:text-rose-500 transition-colors"
        >
          <Film className="w-10 h-10" />
          <span className="text-sm font-medium">Select a video</span>
          <span className="text-xs text-slate-300">Up to 100MB</span>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFile}
      />

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Write a caption... Use @ to mention"
        className="input-field resize-none min-h-[80px]"
        maxLength={2200}
      />

      <input
        value={audioTitle}
        onChange={(e) => setAudioTitle(e.target.value)}
        placeholder="Audio title (optional)"
        className="input-field"
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !file}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Share Reel
      </button>
    </div>
  );
}
