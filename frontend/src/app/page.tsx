import { LoginCard } from "@/features/auth/components/login-card";
import { SocketStatus } from "@/features/realtime/components/socket-status";
import { QueryHealth } from "@/features/query/components/query-health";

export default function Home() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-amber-50 via-background to-cyan-50 p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.2),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(14,116,144,0.2),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(34,197,94,0.15),transparent_35%)]" />

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-10 md:flex-row md:items-center md:justify-between">
        <section className="max-w-xl space-y-4">
          <p className="inline-flex rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs tracking-[0.15em] uppercase text-muted-foreground">
            Frontend Bootstrap
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-foreground sm:text-5xl">
            Tabi Frontend is ready with modern stack setup.
          </h1>
          <p className="max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
            Next.js App Router + TypeScript + Tailwind + shadcn/ui + TanStack Query + Zustand + Socket.IO client + React Hook Form + Zod + Axios.
          </p>
          <div className="space-y-1 rounded-xl border border-border/70 bg-background/85 p-4 backdrop-blur">
            <QueryHealth />
            <SocketStatus />
          </div>
        </section>

        <section className="w-full max-w-md">
          <LoginCard />
        </section>
      </main>
    </div>
  )
}
