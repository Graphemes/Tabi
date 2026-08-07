import { create } from "zustand";

type User = {
  id: number;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  mobile?: string;
  phone?: string;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  hasHydrated: boolean;
  hydrate: () => void;
  setAuth: (payload: { accessToken: string; refreshToken: string; user: User }) => void;
  clearAuth: () => void;
};

const TOKEN_KEY = "tabi.accessToken";
const REFRESH_TOKEN_KEY = "tabi.refreshToken";
const USER_KEY = "tabi.user";

const readUser = () => {
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
};

// accessToken/refreshToken/user always start `null` here (matching what the
// server renders) so the very first client render matches the SSR-ed HTML.
// The real values are loaded from localStorage in `hydrate()`, called from a
// `useEffect` after mount — see AppProviders. Reading localStorage directly
// during store creation would make the client's first paint diverge from
// the server's and trigger a full-tree hydration mismatch/remount.
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  hasHydrated: false,
  hydrate: () => {
    if (typeof window === "undefined") {
      return;
    }

    set({
      accessToken: window.localStorage.getItem(TOKEN_KEY),
      refreshToken: window.localStorage.getItem(REFRESH_TOKEN_KEY),
      user: readUser(),
      hasHydrated: true,
    });
  },
  setAuth: ({ accessToken, refreshToken, user }) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_KEY, accessToken);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    set({ accessToken, refreshToken, user, hasHydrated: true });
  },
  clearAuth: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    }

    set({ accessToken: null, refreshToken: null, user: null, hasHydrated: true });
  },
}));
