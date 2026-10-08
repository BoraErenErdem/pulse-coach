"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, CalendarCheck, CheckCheck, Settings, Trash2 } from "lucide-react";
import {
  ApiError,
  deleteAllCheckins,
  deleteCheckin,
  getCheckins,
  markAllCheckinsRead,
  type CheckinKind,
  type CheckinMessage,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { ErrorBanner, IconButton, Skeleton } from "@/components/ui";
import { BackToProfile } from "@/components/BackToProfile";

// Mobil app/checkins.tsx (2026-10-08): güne göre gruplar, türe göre simge + filtre, göreli zaman.
type Filter = "all" | CheckinKind;
type Group = "today" | "yesterday" | "week" | "older";
const DAY_MS = 86400000;
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dayGroup(iso: string): Group {
  const days = Math.round((startOf(new Date()) - startOf(new Date(iso))) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "older";
}

/** Mobil profile-cards.tsx::relativeDay. */
function relativeDay(iso: string, language: PreferredLanguage, t: (tr: string, en: string) => string): string {
  const date = new Date(iso);
  const days = Math.round((startOf(new Date()) - startOf(date)) / DAY_MS);
  const loc = language === "en" ? "en-US" : "tr-TR";
  const time = date.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  if (days <= 0) return t(`Bugün ${time}`, `Today ${time}`);
  if (days === 1) return t(`Dün ${time}`, `Yesterday ${time}`);
  if (days < 7) return t(`${days} gün önce`, `${days} days ago`);
  return date.toLocaleDateString(loc, { day: "numeric", month: "long" });
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
  const [filter, setFilter] = useState<Filter>("all");
  const KIND_META: Record<CheckinKind, { icon: typeof BellRing; label: string; color: string }> = {
    weekly_summary: { icon: CalendarCheck, label: t("Haftalık özet", "Weekly summary"), color: "var(--accent)" },
    daily_nudge: { icon: BellRing, label: t("Hatırlatma", "Reminder"), color: "var(--accent-warm)" },
  };
  const GROUP_LABELS: Record<Group, string> = {
    today: t("Bugün", "Today"),
    yesterday: t("Dün", "Yesterday"),
    week: t("Bu hafta", "This week"),
    older: t("Daha eski", "Older"),
  };
  const visible = useMemo(() => checkins.filter((item) => filter === "all" || item.kind === filter), [checkins, filter]);
  const groups = useMemo(() => {
    const order: Group[] = ["today", "yesterday", "week", "older"];
    const map = new Map<Group, CheckinMessage[]>();
    for (const item of visible) {
      const key = dayGroup(item.generated_at);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return order.filter((key) => map.has(key)).map((key) => ({ key, items: map.get(key) ?? [] }));
  }, [visible]);

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

  const actionBtn =
    "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  const neutralBtn = "border-black/10 dark:border-white/15 bg-white/70 text-zinc-800 hover:bg-white dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Mobilde bu ekran Profil'in üstüne açılıyor: geri bağlantısı (2026-10-07). */}
      <div className="-mb-3">
        <BackToProfile />
      </div>
      <h1 className="text-[30px] font-medium leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{t("Bildirimler", "Notifications")}</h1>

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : checkins.length === 0 ? (
        <div className="pc-panel flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-300">
            {t(
              "Henüz bir bildirimin yok. Koçun haftalık ilerleme özetini ve gerektiğinde günlük hatırlatmaları burada bırakacak.",
              "You don't have any notifications yet. Your coach will leave your weekly progress summary and, when needed, daily reminders here."
            )}
          </p>
          <Link href="/profile/settings" className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] hover:underline">
            <Settings className="h-4 w-4" aria-hidden="true" />
            {t("Bildirim tercihleri", "Notification preferences")}
          </Link>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label={t("Bildirim türü", "Notification type")} className="flex gap-[3px] rounded-2xl bg-[var(--pc-tabs)] p-[3px]">
            {(
              [
                { key: "all", label: t("Tümü", "All") },
                { key: "weekly_summary", label: t("Haftalık", "Weekly") },
                { key: "daily_nudge", label: t("Hatırlatma", "Reminders") },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                type="button"
                role="tab"
                aria-selected={filter === o.key}
                onClick={() => setFilter(o.key)}
                className={`min-h-10 flex-1 rounded-[13px] text-sm font-semibold transition-colors ${
                  filter === o.key ? "bg-[var(--tone-fill)] text-[var(--tone-on-fill)] shadow-sm" : "text-zinc-600 hover:text-zinc-900 dark:text-white/75 dark:hover:text-white"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleMarkAllRead} disabled={!hasUnread} className={`${actionBtn} ${neutralBtn}`}>
              <CheckCheck className="h-4 w-4 opacity-75" aria-hidden="true" />
              {t("Tümünü okundu say", "Mark all read")}
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              onBlur={() => setIsConfirmingDeleteAll(false)}
              className={`${actionBtn} ${isConfirmingDeleteAll ? "border-red-600 bg-red-600 text-white hover:bg-red-700" : neutralBtn}`}
            >
              <Trash2 className="h-4 w-4 opacity-75" aria-hidden="true" />
              {isConfirmingDeleteAll ? t("Emin misin?", "Are you sure?") : t("Tümünü sil", "Delete all")}
            </button>
          </div>

          {visible.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">{t("Bu türde mesaj yok.", "No messages of this type.")}</p> : null}

          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2.5">
              <h2 className="text-[13px] font-semibold text-zinc-500">{GROUP_LABELS[group.key]}</h2>
              {group.items.map((item, index) => {
                const meta = KIND_META[item.kind] ?? KIND_META.weekly_summary;
                const Icon = meta.icon;
                const unreadStyle = item.delivered
                  ? undefined
                  : { borderColor: meta.color, boxShadow: `0 0 14px color-mix(in srgb, ${meta.color} 30%, transparent)` };
                return (
                  <article
                    key={item.id}
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, ...unreadStyle }}
                    className="pc-panel animate-fade-in-up flex flex-col gap-2.5 rounded-[18px] p-4"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
                        style={{
                          color: meta.color,
                          background: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
                          borderColor: `color-mix(in srgb, ${meta.color} 40%, transparent)`,
                        }}
                      >
                        <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
                      </span>
                      <h3 className="flex-1 text-[15px] font-semibold text-zinc-900 dark:text-white">{meta.label}</h3>
                      <span className="text-xs text-zinc-500">{relativeDay(item.generated_at, language, t)}</span>
                      {!item.delivered ? (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white dark:text-[#1e1208]" style={{ background: meta.color }}>
                          {t("Yeni", "New")}
                        </span>
                      ) : null}
                      <IconButton
                        label={t("Bildirimi sil", "Delete notification")}
                        onClick={() => handleDeleteOne(item.id)}
                        className="-my-2 -mr-2 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800 dark:text-white">{item.message}</p>
                  </article>
                );
              })}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
