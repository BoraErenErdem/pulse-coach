"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NavBar } from "@/components/NavBar";
import { LoadingState } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!token) router.replace("/login");
  }, [isLoading, token, router]);

  if (isLoading || !token) {
    return <LoadingState />;
  }

  return (
    <div
      className="flex flex-1 flex-col"
      style={{
        backgroundImage:
          "radial-gradient(70% 40% at 50% 0%, color-mix(in srgb, var(--accent) 5%, transparent), transparent)",
      }}
    >
      <NavBar />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8">
        <div key={pathname} className="animate-fade-in-up flex flex-1 flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}
