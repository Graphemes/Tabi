"use client";

import { io, type Socket } from "socket.io-client";
import { env } from "@/lib/env";
import { refreshAccessToken } from "@/lib/http";

let socketInstance: Socket | null = null;

/** Back-to-back auth failures we'll try to recover from before giving up. */
const MAX_AUTH_RETRIES = 3;

/**
 * The server only checks the token during the handshake, and access tokens last 15
 * minutes. A socket that connects with a stale token is told `auth:error` and dropped —
 * and socket.io never reconnects after a server-side disconnect, so without this every
 * later emit sat in the send buffer forever and every broadcast was missed.
 */
const recoverFromAuthFailures = (socket: Socket) => {
  let failures = 0;

  socket.on("auth:ok", () => {
    failures = 0;
  });

  socket.on("auth:error", async () => {
    failures += 1;
    if (failures > MAX_AUTH_RETRIES) return;
    try {
      await refreshAccessToken();
      // `auth` is read on every attempt, so this handshake carries the new token.
      socket.connect();
    } catch {
      // The refresh token is gone or expired too; the HTTP layer has already logged out.
    }
  });
};

/** `token` is accepted for call-site compatibility; the handshake always reads the latest. */
export const getSocket = (token?: string | null) => {
  if (socketInstance) {
    return socketInstance;
  }

  socketInstance = io(`${env.socketBaseUrl}/realtime`, {
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    // A callback rather than a fixed object, so every connect and reconnect presents
    // whatever token is current — not the one that existed when the socket was created.
    auth: (cb) => {
      const latest =
        typeof window !== "undefined" ? window.localStorage.getItem("tabi.accessToken") : null;
      const current = latest ?? token;
      cb(current ? { token: current } : {});
    },
  });

  recoverFromAuthFailures(socketInstance);

  return socketInstance;
};

export const disconnectSocket = () => {
  if (!socketInstance) {
    return;
  }

  socketInstance.disconnect();
  socketInstance = null;
};
