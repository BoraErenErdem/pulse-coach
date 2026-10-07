"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  Bell,
  ChevronRight,
  Crown,
  Dumbbell,
  Flame,
  HeartPulse,
  LogOut,
  Smile,
  Target,
  Trophy,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import {
  getAchievements,
  getLatestCheckin,
  getMoodHistory,
  getWeeklyGoal,
  getWeeklySummary,
  type AchievementBadge,
  type CheckinMessage,
  type MoodKey,
  type MoodLog,
  type Profile,
  type WeeklyGoal,
  type WeeklySummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { displayNameOf, getTimeGreeting } from "@/lib/greeting";
import { useLanguage, useT } from "@/lib/language-context";
import { Card, StatTile } from "@/components/ui";
import { tileStyle } from "@/lib/identity";
import { useUnreadCheckins } from "@/lib/use-unread-checkins";

// Mobil Profil sekmesinin (kimlik kartı, özet kutuları, koç notu, başarılar) web
// karşılığı - 2026-10-06 eşitleme: web profili yalnız ayar formundan ibaretti,
// /progress/achievements ve /checkins/latest web'de hiç kullanılmıyordu.

const MOOD_EMOJI: Record<MoodKey, string> = { zor: "😔", dusuk: "😕", notr: "🙂", iyi: "😊", harika: "🤩" };
const MOOD_SCORE: Record<MoodKey, number> = { zor: 1, dusuk: 2, notr: 3, iyi: 4, harika: 5 };
const SCORE_MOOD: MoodKey[] = ["zor", "dusuk", "notr", "iyi", "harika"];

type BadgeMeta = { icon: LucideIcon; tr: string; en: string; descTr: string; descEn: string };

// mobile/components/profile-cards.tsx BADGE_META ile aynı metinler.
const BADGE_META: Record<string, BadgeMeta> = {
  first_workout: { icon: Dumbbell, tr: "İlk Antrenman", en: "First Workout", descTr: "İlk antrenmanını kaydet.", descEn: "Log your first workout." },
  streak_3: {
    icon: Flame,
    tr: "3 Günlük Seri",
    en: "3-Day Streak",
    descTr: "Günlük hedeflerini (ruh hali + kalori hedefi) 3 gün üst üste tamamla.",
    descEn: "Complete your daily goals (mood + calorie goal) 3 days in a row.",
  },
  goal_reached: { icon: Target, tr: "Hedefe Ulaştın", en: "Goal Reached", descTr: "Bir egzersiz hedefine ulaş.", descEn: "Reach an exercise goal." },
  mood_14: { icon: HeartPulse, tr: "Duygu Günlüğü", en: "Mood Journal", descTr: "14 farklı günde ruh halini kaydet.", descEn: "Log your mood on 14 different days." },
  workouts_10: { icon: Dumbbell, tr: "10 Antrenman", en: "10 Workouts", descTr: "10 farklı günde antrenman yap.", descEn: "Work out on 10 different days." },
  streak_7: {
    icon: Flame,
    tr: "7 Günlük Seri",
    en: "7-Day Streak",
    descTr: "Günlük hedeflerini 7 gün üst üste tamamla.",
    descEn: "Complete your daily goals 7 days in a row.",
  },
  meals_30: { icon: Utensils, tr: "Beslenme Takibi", en: "Food Tracker", descTr: "30 farklı günde öğün kaydet.", descEn: "Log meals on 30 different days." },
  workouts_50: { icon: Trophy, tr: "50 Antrenman", en: "50 Workouts", descTr: "50 farklı günde antrenman yap.", descEn: "Work out on 50 different days." },
  streak_30: {
    icon: Crown,
    tr: "30 Günlük Seri",
    en: "30-Day Streak",
    descTr: "Günlük hedeflerini 30 gün üst üste tamamla.",
    descEn: "Complete your daily goals 30 days in a row.",
  },
};
const FALLBACK_META: BadgeMeta = { icon: Award, tr: "Rozet", en: "Badge", descTr: "", descEn: "" };

export function ProfileOverview({ profile }: { profile: Profile | null }) {
  const { token, user, logout } = useAuth();
  const unread = useUnreadCheckins();
  const { language } = useLanguage();
  const t = useT();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [weekly, setWeekly] = useState<WeeklyGoal | null>(null);
  const [moodWeek, setMoodWeek] = useState<MoodLog[] | null>(null);
  const [latest, setLatest] = useState<CheckinMessage | null>(null);
  const [badges, setBadges] = useState<AchievementBadge[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // Biri düşerse diğerleri yine gösterilir (mobil Profil ile aynı allSettled).
    void Promise.allSettled([
      getWeeklySummary(token).then(setSummary),
      getWeeklyGoal(token).then(setWeekly),
      getMoodHistory(token, 7).then(setMoodWeek),
      getLatestCheckin(token).then(setLatest),
      getAchievements(token).then((result) => setBadges(result.badges)),
    ]);
  }, [token]);

  if (!user) return null;

  const name = displayNameOf(profile, user.email);
  const memberSince = new Date(user.created_at).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", {
    month: "long",
    year: "numeric",
  });
  const GOAL_LABELS: Record<string, string> = {
    weight_loss: t("Kilo vermek", "Lose weight"),
    muscle_gain: t("Kas yapmak", "Build muscle"),
    general_health: t("Genel sağlık", "General health"),
  };
  const ACTIVITY_LABELS: Record<string, string> = {
    sedentary: t("Hareketsiz", "Sedentary"),
    light: t("Hafif aktif", "Lightly active"),
    moderate: t("Orta aktif", "Moderately active"),
    active: t("Çok aktif", "Very active"),
  };
  const TONE_LABELS: Record<string, string> = {
    sicak: t("Koç: Samimi", "Coach: Warm"),
    enerjik: t("Koç: Enerjik", "Coach: Energetic"),
    notr: t("Koç: Nötr", "Coach: Neutral"),
  };
  const chips = [
    profile?.goal ? GOAL_LABELS[profile.goal] : null,
    profile?.activity_level ? ACTIVITY_LABELS[profile.activity_level] : null,
    TONE_LABELS[profile?.coach_tone ?? "notr"],
  ].filter((chip): chip is string => !!chip);

  const moodAverage =
    moodWeek && moodWeek.length > 0
      ? SCORE_MOOD[
          Math.min(4, Math.max(0, Math.round(moodWeek.reduce((sum, entry) => sum + MOOD_SCORE[entry.mood_key], 0) / moodWeek.length) - 1))
        ]
      : null;
  const workoutValue = weekly ? (weekly.goal_days ? `${weekly.done_days}/${weekly.goal_days}` : String(weekly.done_days)) : "–";
  const earned = badges?.filter((badge) => badge.earned).length ?? 0;
  const selected = badges?.find((badge) => badge.key === selectedKey) ?? null;
  const selectedMeta = selected ? (BADGE_META[selected.key] ?? FALLBACK_META) : null;

  return (
    <>
      {/* Mobil profil kahraman kartı: ametist kimlik (koyuda gradyan, açıkta tonlu beyaz). */}
      <div className="pc-tile flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6" style={tileStyle("profileHero")}>
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--tone-fill)] text-2xl font-semibold text-[var(--tone-on-fill)] dark:bg-white/20 dark:text-white"
        >
          {name.charAt(0).toLocaleUpperCase(language === "en" ? "en-US" : "tr-TR")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--tile-subtle)]">{getTimeGreeting(new Date(), language)}</p>
          <h2 className="truncate text-2xl font-medium text-[var(--tile-text)]">{name}</h2>
          <p className="truncate text-sm text-[var(--tile-subtle)]">
            {user.email} · {t(`Üye: ${memberSince}`, `Member since ${memberSince}`)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span key={chip} className="rounded-full border border-[color-mix(in_srgb,var(--tile-icon)_45%,transparent)] bg-[color-mix(in_srgb,var(--tile-icon)_14%,transparent)] px-3 py-1 text-xs font-medium text-[var(--tile-text)]">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile identity="profileStreak" icon={<Flame />} label={t("Seri", "Streak")} value={summary ? t(`${summary.streak_days} gün`, `${summary.streak_days} d`) : "–"} hint={t("üst üste", "in a row")} />
        <StatTile identity="profileWorkouts" icon={<Dumbbell />} label={t("Bu Hafta", "This Week")} value={workoutValue} hint={t("antrenman günü", "workout days")} />
        <StatTile
          identity="profileMood"
          icon={<Smile />}
          label={t("Ruh Hali", "Mood")}
          value={moodAverage ? MOOD_EMOJI[moodAverage] : "–"}
          hint={moodAverage ? t("7 gün ortalaması", "7-day average") : t("kayıt yok", "no entries")}
        />
      </div>

      {/* Koç notu: sayfa tonunda koç kartı (mobil CoachNoteCard). */}
      <Link href="/checkins" className="block transition-transform hover:-translate-y-0.5">
        <div className="pc-insight flex items-start gap-4 p-[18px]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/25">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{t("Koçundan Son Not", "Latest From Your Coach")}</p>
            <p className="mt-1 line-clamp-3 text-sm opacity-95">
              {latest
                ? latest.message
                : t(
                    "Koçun haftalık ilerleme özetini ve hatırlatmaları burada bırakacak.",
                    "Your coach will leave your weekly progress summary and reminders here."
                  )}
            </p>
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold">
              {t("Tüm bildirimler", "All notifications")} <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </p>
          </div>
        </div>
      </Link>

      {/* Mobil Profil menüsü: alt sayfalar ve çıkış (web'deki hamburger menü kaldırıldı). */}
      <Card className="p-2 sm:p-2">
        <ul className="divide-y divide-[var(--border-subtle)]">
          {[
            { href: "/goals", icon: Target, label: t("Hedef Merkezi", "Goal Center"), hint: t("Beslenme, antrenman ve vücut hedeflerin", "Your nutrition, training and body goals") },
            { href: "/mood", icon: Smile, label: t("Ruh Hali", "Mood"), hint: t("Takvim ve geçmiş kayıtların", "Calendar and past entries") },
            {
              href: "/checkins",
              icon: Bell,
              label: t("Bildirimler", "Notifications"),
              hint: unread > 0 ? t(`${unread} okunmamış mesaj`, `${unread} unread`) : t("Koçunun mesajları", "Messages from your coach"),
            },
          ].map((row) => (
            <li key={row.href}>
              <Link href={row.href} className="flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-[var(--surface-muted)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tone-accent)_14%,transparent)] text-[var(--tone-accent)]">
                  <row.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-zinc-900 dark:text-zinc-50">{row.label}</span>
                  <span className="block truncate text-sm text-zinc-500">{row.hint}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={logout}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-muted)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-zinc-600 dark:text-zinc-300">
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{t("Çıkış Yap", "Log Out")}</span>
            </button>
          </li>
        </ul>
      </Card>

      <Card>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Başarıların", "Achievements")}</h2>
          {badges ? (
            <span className="text-sm text-zinc-500">{t(`${badges.length} rozetten ${earned}`, `${earned} of ${badges.length}`)}</span>
          ) : null}
        </div>
        {badges ? (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
            {badges.map((badge) => {
              const meta = BADGE_META[badge.key] ?? FALLBACK_META;
              const Icon = meta.icon;
              const title = language === "en" ? meta.en : meta.tr;
              const progress = Math.min(1, badge.current / badge.threshold);
              const isSelected = badge.key === selectedKey;
              return (
                <li key={badge.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey((current) => (current === badge.key ? null : badge.key))}
                    aria-pressed={isSelected}
                    aria-label={`${title}: ${badge.earned ? t("kazanıldı", "earned") : `${Math.min(badge.current, badge.threshold)}/${badge.threshold}`}`}
                    className="flex w-full flex-col items-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-full ${
                        badge.earned
                          ? "bg-gradient-to-br from-[#A57BEF] to-[#5E3A96] text-white"
                          : "bg-[var(--surface-muted)] text-zinc-400"
                      } ${isSelected ? "ring-2 ring-[var(--tone-accent)] ring-offset-2 ring-offset-[var(--surface)]" : ""}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className={`text-xs font-medium leading-tight ${badge.earned ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500"}`}>
                      {title}
                    </span>
                    {!badge.earned ? (
                      <span className="h-1 w-10 overflow-hidden rounded-full bg-[var(--surface-muted)]" aria-hidden="true">
                        <span className="block h-full rounded-full bg-[var(--tone-accent)]" style={{ width: `${progress * 100}%` }} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="h-20 animate-pulse rounded-lg bg-[var(--surface-muted)]" />
        )}
        {selected && selectedMeta ? (
          <p className="mt-4 rounded-lg bg-[var(--surface-muted)] px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200" aria-live="polite">
            <span className="font-semibold">{language === "en" ? selectedMeta.en : selectedMeta.tr}</span>
            {selected.earned ? ` · ${t("Kazanıldı ✓", "Earned ✓")}` : ` · ${Math.min(selected.current, selected.threshold)}/${selected.threshold}`}
            <br />
            {language === "en" ? selectedMeta.descEn : selectedMeta.descTr}
          </p>
        ) : null}
      </Card>
    </>
  );
}
