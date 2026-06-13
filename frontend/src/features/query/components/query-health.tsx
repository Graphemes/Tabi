"use client";

import { useQuery } from "@tanstack/react-query";
import { http } from "@/lib/http";

const ping = async () => {
  const { data } = await http.get("/");
  return data as { message?: string };
};

export function QueryHealth() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: ping,
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">API: checking...</p>;
  }

  if (query.isError) {
    return <p className="text-sm text-destructive">API: unreachable</p>;
  }

  return (
    <p className="text-sm text-emerald-600">
      API: connected{query.data?.message ? ` (${query.data.message})` : ""}
    </p>
  );
}
