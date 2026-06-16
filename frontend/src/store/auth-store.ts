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
  setAuth: (payload: { accessToken: string; refreshToken: string; user: User }) => void;
  clearAuth: () => void;
};

const TOKEN_KEY = "tabi.accessToken";
const REFRESH_TOKEN_KEY = "tabi.refreshToken";
const USER_KEY = "tabi.user";

const readUser = () => {
  if (typeof window === "undefined") {
    return null;
  }

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

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null,
  refreshToken: typeof window !== "undefined" ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null,
  user: readUser(),
  setAuth: ({ accessToken, refreshToken, user }) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_KEY, accessToken);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    set({ accessToken, refreshToken, user });
  },
  clearAuth: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    }

    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
