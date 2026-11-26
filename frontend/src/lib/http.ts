import axios from "axios";
import { env } from "@/lib/env";
import { useAuthStore } from "@/store/auth-store";

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
});

let refreshing: Promise<string> | null = null;

/**
 * Trades the refresh token for a new access token. Concurrent callers share one request:
 * the refresh token rotates on use, so a second parallel refresh would present a token
 * the server has already retired and log the user out. Also used by the socket, whose
 * handshake token is only checked on connect and goes stale after 15 minutes.
 */
export const refreshAccessToken = (): Promise<string> => {
  refreshing ??= (async () => {
    try {
      const refreshToken = window.localStorage.getItem("tabi.refreshToken");
      if (!refreshToken) {
        throw new Error("No refresh token");
      }

      const { data } = await axios.post(`${env.apiBaseUrl}/auth/refresh`, {
        refresh_token: refreshToken,
      });

      window.localStorage.setItem("tabi.accessToken", data.access_token);
      window.localStorage.setItem("tabi.refreshToken", data.refresh_token);

      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.getState().setAuth({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          user: currentUser,
        });
      }

      return data.access_token as string;
    } catch (err) {
      useAuthStore.getState().clearAuth();
      throw err;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
};

http.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("tabi.accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes("/auth/refresh")) {
      originalRequest._retry = true;
      const token = await refreshAccessToken();
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return http(originalRequest);
    }

    return Promise.reject(error);
  },
);
