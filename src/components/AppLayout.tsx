import { useNav, Page } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { Home, Search, Compass, Film, MessageCircle, Bell, Plus, User } from 'lucide-react';
import Avatar from './Avatar';
import { useState } from 'react';
import CreateModal from './CreateModal';

const navItems: { page: Page; label: string; icon: typeof Home }[] = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'search', label: 'Search', icon: Search },
  { page: 'explore', label: 'Explore', icon: Compass },
  { page: 'reels', label: 'Reels', icon: Film },
  { page: 'messages', label: 'Messages', icon: MessageCircle },
  { page: 'notifications', label: 'Notifications', icon: Bell },
  { page: 'profile', label: 'Profile', icon: User },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { page, navigate, unreadMessages, unreadNotifications } = useNav();
  const { profile } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const showBadge = (p: Page): number => {
    if (p === 'messages') return unreadMessages;
    if (p === 'notifications') return unreadNotifications;
    return 0;
  };

  const badgeLabel = (count: number) => count > 99 ? '99+' : String(count);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-slate-200 bg-white flex-col py-6 px-3 z-30">
        <div className="px-3 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white font-bold text-lg flex items-center justify-center shadow-lg shadow-sky-500/20">
              Sx
            </div>
            <span className="text-xl font-bold text-slate-900">SocialX</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = page === item.page;
            const badge = showBadge(item.page);
            return (
              <button
                key={item.page}
                onClick={() => navigate(item.page, item.page === 'profile' ? profile?.id : undefined)}
                className={`w-full flex items-center gap-4 px-3 py-3 rounded-xl transition-colors ${
                  isActive ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="relative">
                  <Icon className={`nav-icon ${isActive ? 'text-sky-600' : ''}`} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {badgeLabel(badge)}
                    </span>
                  )}
                </div>
                <span className="text-base">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => setCreateOpen(true)}
          className="btn-primary w-full flex items-center justify-center gap-2 mt-4"
        >
          <Plus className="w-5 h-5" />
          Create
        </button>

        {profile && (
          <div className="mt-auto pt-4 border-t border-slate-100">
            <button
              onClick={() => navigate('profile', profile.id)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 w-full transition-colors"
            >
              <Avatar profile={profile} size="sm" />
              <div className="text-left flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{profile.display_name || profile.username}</div>
                <div className="text-xs text-slate-400 truncate">@{profile.username}</div>
              </div>
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="md:ml-64 min-h-screen pb-20 md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.filter(i => i.page !== 'notifications').slice(0, 2).map(item => {
            const Icon = item.icon;
            const isActive = page === item.page;
            const badge = showBadge(item.page);
            return (
              <button key={item.page} onClick={() => navigate(item.page)} className="flex flex-col items-center justify-center flex-1 h-full">
                <div className="relative">
                  <Icon className={`nav-icon ${isActive ? 'text-sky-600' : 'text-slate-500'}`} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                      {badgeLabel(badge)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Create button */}
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center justify-center flex-1 h-full"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md active:scale-90 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
          </button>

          {navItems.filter(i => i.page === 'reels' || i.page === 'messages' || i.page === 'profile').map(item => {
            const Icon = item.icon;
            const isActive = page === item.page;
            const badge = showBadge(item.page);
            return (
              <button
                key={item.page}
                onClick={() => navigate(item.page, item.page === 'profile' ? profile?.id : undefined)}
                className="flex flex-col items-center justify-center flex-1 h-full"
              >
                <div className="relative">
                  <Icon className={`nav-icon ${isActive ? 'text-sky-600' : 'text-slate-500'}`} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                      {badgeLabel(badge)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Notifications icon for mobile */}
          <button
            onClick={() => navigate('notifications')}
            className="flex flex-col items-center justify-center flex-1 h-full"
          >
            <div className="relative">
              <Bell className={`nav-icon ${page === 'notifications' ? 'text-sky-600' : 'text-slate-500'}`} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                  {badgeLabel(unreadNotifications)}
                </span>
              )}
            </div>
          </button>
        </div>
      </nav>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
