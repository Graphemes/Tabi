const getEnv = (key: string, fallback: string) => {
  const value = process.env[key]
  if (!value || value.trim().length === 0) {
    return fallback
  }

  return value
}

export const env = {
  apiBaseUrl: getEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3000"),
  socketBaseUrl: getEnv("NEXT_PUBLIC_SOCKET_BASE_URL", "http://localhost:3000"),
}
