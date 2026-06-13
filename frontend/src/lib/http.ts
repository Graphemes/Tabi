import axios from "axios";
import { env } from "@/lib/env";

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
});

http.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("tabi.accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});
