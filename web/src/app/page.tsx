"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingState } from "@/components/ui";

export default function Home() {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(token ? "/chat" : "/login");
  }, [isLoading, token, router]);

  return <LoadingState />;
}
