import axios from "axios";
import { env } from "@/lib/env";
import { useAuthStore } from "@/store/auth-store";

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
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
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return http(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

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

        processQueue(null, data.access_token);

        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return http(originalRequest);
      } catch (err) {
        processQueue(err, null);
        useAuthStore.getState().clearAuth();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
