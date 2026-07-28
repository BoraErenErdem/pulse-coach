"use client";

import { useEffect, useState } from "react";
import { Bell, MessageSquareHeart } from "lucide-react";
import { ApiError, getCheckins, type CheckinMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ErrorBanner, LoadingState } from "@/components/ui";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CheckinsPage() {
  const { token } = useAuth();
  const [checkins, setCheckins] = useState<CheckinMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getCheckins(token)
      .then(setCheckins)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Yüklenemedi."));
  }, [token]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Check-in Mesajları
      </h1>

      {error ? <ErrorBanner message={error} /> : null}

      {checkins === null && !error ? (
        <LoadingState />
      ) : checkins && checkins.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <Bell className="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
          <p className="max-w-xs text-sm text-zinc-500">
            Henüz bir check-in mesajın yok. Koçun her hafta ilerlemene göre otomatik bir
            check-in mesajı bırakacak.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {checkins?.map((checkin, index) => (
            <div
              key={checkin.id}
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              className={`animate-fade-in-up flex gap-3 rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-900 ${
                !checkin.delivered
                  ? "border-accent/30"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <MessageSquareHeart className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(checkin.generated_at)}
                  </span>
                  {!checkin.delivered ? (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                      Yeni
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-100">
                  {checkin.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
