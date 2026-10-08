import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { NavProvider, useNav } from '@/context/NavContext';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import AuthPage from '@/pages/AuthPage';
import AppLayout from '@/components/AppLayout';
import HomePage from '@/pages/HomePage';
import SearchPage from '@/pages/SearchPage';
import ExplorePage from '@/pages/ExplorePage';
import ReelsPage from '@/pages/ReelsPage';
import MessagesPage from '@/pages/MessagesPage';
import NotificationsPage from '@/pages/NotificationsPage';
import ProfilePage from '@/pages/ProfilePage';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { session, loading } = useAuth();
  const { page, profileUserId, navigate } = useNav();
  useUnreadCounts();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  // Parse startReelId from profileUserId when page is 'reels'
  // It could be a reelId or a userId depending on context
  const renderPage = () => {
    switch (page) {
      case 'home':
        return <HomePage />;
      case 'search':
        return <SearchPage />;
      case 'explore':
        return <ExplorePage />;
      case 'reels':
        return <ReelsPage startReelId={profileUserId || undefined} />;
      case 'messages':
        return <MessagesPage startUserId={profileUserId || undefined} />;
      case 'notifications':
        return <NotificationsPage />;
      case 'profile':
        return <ProfilePage userId={profileUserId} />;
      default:
        return <HomePage />;
    }
  };

  // For messages and reels, we need special handling for the navigation target
  // The NavContext navigate function passes userId for profile pages,
  // but for messages it passes a userId to start a conversation with,
  // and for reels it passes a reelId to start at.
  // We handle this in the navigate calls themselves.

  return <AppLayout>{renderPage()}</AppLayout>;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NavProvider>
          <AppContent />
        </NavProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
