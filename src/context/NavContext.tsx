import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type Page =
  | 'home'
  | 'search'
  | 'explore'
  | 'reels'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'create';

interface NavContextType {
  page: Page;
  profileUserId: string | null;
  navigate: (page: Page, userId?: string) => void;
  unreadMessages: number;
  unreadNotifications: number;
  setUnreadMessages: (n: number) => void;
  setUnreadNotifications: (n: number) => void;
}

const NavContext = createContext<NavContextType | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('home');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const navigate = useCallback((p: Page, userId?: string) => {
    setPage(p);
    if (p === 'profile' && userId) {
      setProfileUserId(userId);
    }
    if (p !== 'profile') {
      setProfileUserId(null);
    }
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <NavContext.Provider value={{
      page, profileUserId, navigate,
      unreadMessages, unreadNotifications,
      setUnreadMessages, setUnreadNotifications,
    }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const context = useContext(NavContext);
  if (!context) throw new Error('useNav must be used within NavProvider');
  return context;
}
