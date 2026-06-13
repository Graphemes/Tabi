import { create } from "zustand";

type User = {
  id: number;
  email: string;
  username: string;
  name?: string;
  mobile?: string;
  phone?: string;
};

type AuthState = {
  accessToken: string | null;
  user: User | null;
  setAuth: (payload: { accessToken: string; user: User }) => void;
  clearAuth: () => void;
};

const TOKEN_KEY = "tabi.accessToken";
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
  user: readUser(),
  setAuth: ({ accessToken, user }) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_KEY, accessToken);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    set({ accessToken, user });
  },
  clearAuth: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    }

    set({ accessToken: null, user: null });
  },
}));
