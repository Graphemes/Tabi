import { create } from "zustand"

type User = {
  id: number
  email: string
  username: string
}

type AuthState = {
  accessToken: string | null
  user: User | null
  setAuth: (payload: { accessToken: string; user: User }) => void
  clearAuth: () => void
}

const TOKEN_KEY = "tabi.accessToken"

export const useAuthStore = create<AuthState>((set) => ({
  accessToken:
    typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null,
  user: null,
  setAuth: ({ accessToken, user }) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_KEY, accessToken)
    }

    set({ accessToken, user })
  },
  clearAuth: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY)
    }

    set({ accessToken: null, user: null })
  },
}))
