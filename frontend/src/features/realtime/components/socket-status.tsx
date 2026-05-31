"use client"

import { useEffect, useState } from "react"
import { disconnectSocket, getSocket } from "@/lib/socket"
import { useAuthStore } from "@/store/auth-store"

export function SocketStatus() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!accessToken) {
      disconnectSocket()
      return
    }

    const socket = getSocket(accessToken)

    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)

    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
    }
  }, [accessToken])

  if (!accessToken) {
    return <p className="text-sm text-muted-foreground">Socket: waiting for auth</p>
  }

  return (
    <p className="text-sm">
      Socket: <span className={connected ? "text-emerald-600" : "text-amber-600"}>{connected ? "connected" : "connecting"}</span>
    </p>
  )
}
