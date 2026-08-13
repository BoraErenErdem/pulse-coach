"use client";

import { useState } from "react";
import { Bell, CheckCheck, MessageSquareHeart, Trash2 } from "lucide-react";
import {
  ApiError,
  deleteAllCheckins,
  deleteCheckin,
  getCheckins,
  markAllCheckinsRead,
  type CheckinMessage,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui";

function formatDateTime(iso: string, language: PreferredLanguage): string {
  return new Date(iso).toLocaleString(language === "en" ? "en-US" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CheckinsPage() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [checkins, setCheckins] = useState<CheckinMessage[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);

  // Diğer tüm liste sayfalarının (goals/progress/workouts/mood/nutrition)
  // kullandığı paylaşımlı iskelet - önceden bu sayfa kendi ad-hoc useEffect+
  // LoadingState'ini kullanıyordu (2026-08-13 tutarlılık incelemesinde
  // bulundu, diğer sayfalarla görsel/kod tutarlılığı için birleştirildi).
  const { isLoading, error } = useAsyncResource(async () => {
    if (!token) return;
    const data = await getCheckins(token);
    setCheckins(data);
  }, [token]);

  const hasUnread = checkins.some((c) => !c.delivered);

  async function handleMarkAllRead() {
    if (!token) return;
    setActionError(null);
    try {
      await markAllCheckinsRead(token);
      setCheckins((prev) => prev.map((c) => ({ ...c, delivered: true })));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("Yapılamadı, tekrar dener misin?", "Couldn't do that, want to try again?"));
    }
  }

  async function handleDeleteOne(checkinId: number) {
    if (!token) return;
    setActionError(null);
    try {
      await deleteCheckin(token, checkinId);
      setCheckins((prev) => prev.filter((c) => c.id !== checkinId));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  async function handleDeleteAll() {
    if (!token) return;
    if (!isConfirmingDeleteAll) {
      // İki adımlı onay - geri alınamaz toplu bir işlem, tek tıkla
      // yanlışlıkla tetiklenmesin (bkz. profile/page.tsx hesap silme akışı,
      // burada daha hafif bir versiyonu yeterli).
      setIsConfirmingDeleteAll(true);
      return;
    }
    setActionError(null);
    try {
      await deleteAllCheckins(token);
      setCheckins([]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    } finally {
      setIsConfirmingDeleteAll(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Bildirimler", "Notifications")}
        </h1>
        {checkins.length > 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={!hasUnread}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t("Tümünü okundu işaretle", "Mark all as read")}
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              onBlur={() => setIsConfirmingDeleteAll(false)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isConfirmingDeleteAll
                  ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                  : "border-[var(--border-subtle)] text-zinc-600 hover:bg-[var(--surface-muted)] dark:text-zinc-300"
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isConfirmingDeleteAll ? t("Emin misin?", "Are you sure?") : t("Tümünü sil", "Delete all")}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : checkins.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-8 w-8" />}
          message={t(
            "Henüz bir bildirimin yok. Koçun haftalık ilerleme özetini ve gerektiğinde günlük hatırlatmaları burada bırakacak.",
            "You don't have any notifications yet. Your coach will leave your weekly progress summary and, when needed, daily reminders here."
          )}
        />
      ) : (
        <div className="space-y-4">
          {checkins.map((checkin, index) => (
            <div
              key={checkin.id}
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              className={`animate-fade-in-up flex gap-3 rounded-xl border bg-[var(--surface)] p-5 shadow-sm ${
                !checkin.delivered ? "border-accent/30" : "border-[var(--border-subtle)]"
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <MessageSquareHeart className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(checkin.generated_at, language)}
                  </span>
                  {!checkin.delivered ? (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                      {t("Yeni", "New")}
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-100">
                  {checkin.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteOne(checkin.id)}
                className="h-fit shrink-0 text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                aria-label={t("Bildirimi sil", "Delete notification")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
