import { getAvatarUrl } from '@/lib/utils';
import { Profile } from '@/types';

interface AvatarProps {
  profile: Pick<Profile, 'avatar_url' | 'username' | 'display_name'>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  ring?: boolean;
  onClick?: () => void;
}

const sizeMap = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
  '2xl': 'w-24 h-24',
};

export default function Avatar({ profile, size = 'md', ring, onClick }: AvatarProps) {
  const url = getAvatarUrl(profile.avatar_url);
  const sizeClass = sizeMap[size];

  const initials = (profile.display_name || profile.username || '?').slice(0, 2).toUpperCase();

  const inner = url ? (
    <img src={url} alt={profile.username} className={`avatar ${sizeClass}`} />
  ) : (
    <div className={`avatar ${sizeClass} flex items-center justify-center bg-gradient-to-tr from-sky-400 to-blue-600 text-white font-semibold text-xs`}
      style={{ fontSize: size === '2xl' ? '1.5rem' : size === 'xl' ? '1rem' : '0.75rem' }}
    >
      {initials}
    </div>
  );

  if (ring) {
    return (
      <div className={`gradient-border inline-block ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
        <div className="bg-white p-[2px] rounded-full">{inner}</div>
      </div>
    );
  }

  return (
    <div className={onClick ? 'cursor-pointer' : ''} onClick={onClick}>
      {inner}
    </div>
  );
}
