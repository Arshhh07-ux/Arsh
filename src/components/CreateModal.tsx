import { useState } from 'react';
import Modal from './Modal';
import { FileImage, Film, Camera } from 'lucide-react';
import CreatePost from './create/CreatePost';
import CreateReel from './create/CreateReel';
import CreateStory from './create/CreateStory';

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
}

type CreateType = 'menu' | 'post' | 'reel' | 'story';

export default function CreateModal({ open, onClose }: CreateModalProps) {
  const [type, setType] = useState<CreateType>('menu');

  const handleClose = () => {
    setType('menu');
    onClose();
  };

  const handleDone = () => {
    setType('menu');
    onClose();
  };

  const options = [
    { key: 'post' as const, label: 'Post', desc: 'Share photos and videos', icon: FileImage, color: 'from-sky-400 to-blue-500' },
    { key: 'reel' as const, label: 'Reel', desc: 'Share a short video', icon: Film, color: 'from-rose-400 to-pink-500' },
    { key: 'story' as const, label: 'Story', desc: 'Share a moment', icon: Camera, color: 'from-amber-400 to-orange-500' },
  ];

  return (
    <Modal open={open} onClose={handleClose} title={type === 'menu' ? 'Create' : undefined}>
      {type === 'menu' && (
        <div className="p-2">
          {options.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => setType(opt.key)}
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${opt.color} flex items-center justify-center text-white shadow-md`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-900">{opt.label}</div>
                  <div className="text-sm text-slate-400">{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {type === 'post' && <CreatePost onDone={handleDone} />}
      {type === 'reel' && <CreateReel onDone={handleDone} />}
      {type === 'story' && <CreateStory onDone={handleDone} />}
    </Modal>
  );
}
