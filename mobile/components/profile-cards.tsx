import { memo, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Award,
  BellRing,
  CalendarCheck,
  Check,
  ChevronRight,
  Crown,
  Dumbbell,
  Flame,
  HeartPulse,
  MessageSquareHeart,
  Pencil,
  ShieldAlert,
  Target,
  Trophy,
  Utensils,
} from "lucide-react-native";
import type { AchievementBadge, CheckinMessage, PreferredLanguage } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { formatDate } from "@/lib/format";
import { tapLight } from "@/lib/haptics";
import { TypingIndicator, useThemeColors } from "@/components/ui";
import { GlassShell } from "@/components/progress-cards";
import { useRampColor } from "@/components/surface-tone";
import { ConfettiBurst } from "@/components/progress-motion";
import { useGoalGreen, useIdentityColors } from "@/components/progress-identity";
import { useWorkoutIdentityColors } from "@/components/workout-identity";
import { useNutrientColors, useNutritionAccent } from "@/components/nutrition-identity";
import type { GoalItem, GoalOwner } from "@/components/goal-overview";
import {
  PROFILE_GOALS_GRADIENT_DARK,
  PROFILE_HERO_GRADIENT_DARK,
  PROFILE_INSIGHT_TONE,
  PROFILE_TILE_GRADIENT_DARK,
  useProfileAccent,
  useProfileTileColors,
  type ProfileTileKey,
} from "@/components/profile-identity";

// Profil sekmesi (2026-09-25 redesign) kartları - tasarım dilinin kart
// hiyerarşisi: kimlik kartı + 3 parlak kutu > SAKİN hedef özeti > KOYU koç
// kartı; ardından başarılar ve menü panelleri (sayfanın yüzey tonunda).
// Ortak Card/StatTile'a dokunulmadı (diğer ekranlar kullanıyor).

function usePalette() {
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  return {
    isDark,
    c,
    text: isDark ? "#FFFFFF" : c.text,
    muted: isDark ? "rgba(255,255,255,0.78)" : c.muted,
  };
}

/** Hedef sahibinin (sekmenin) kimlik rengi - hedef satırlarında nokta/çubuk. */
export function useGoalOwnerColors(): Record<GoalOwner, string> {
  const ids = useIdentityColors();
  const workout = useWorkoutIdentityColors().sessions;
  const { theme } = useTheme();
  const nutritionText = useNutritionAccent();
  const nutritionGraphic = useNutrientColors().kalori;
  return useMemo(
    () => ({
      progress: ids.weight,
      workouts: workout,
      nutrition: theme === "dark" ? nutritionText : nutritionGraphic,
    }),
    [ids.weight, workout, theme, nutritionText, nutritionGraphic]
  );
}

// ------------------------------------------------------------ kimlik kartı

export function ProfileHeroCard({
  initial,
  greeting,
  name,
  memberSince,
  chips,
  restrictions,
  needsSetup,
  onEdit,
}: {
  initial: string;
  greeting: string;
  name: string;
  memberSince: string | null;
  chips: string[];
  restrictions: string | null;
  needsSetup: boolean;
  onEdit: () => void;
}) {
  const p = usePalette();
  const t = useT();
  const accent = useProfileAccent();
  return (
    <GlassShell
      gradient={PROFILE_HERO_GRADIENT_DARK}
      lightFill="rgba(255,255,255,0.9)"
      lightGradient={[`${accent.graphic}33`, "rgba(255,255,255,0.9)"]}
      glow={p.isDark ? PROFILE_HERO_GRADIENT_DARK[0] : accent.graphic}
      radius={22}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.heroBody}>
        <View style={styles.heroTop}>
          <View
            style={[
              styles.avatar,
              p.isDark
                ? { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.4)" }
                : { backgroundColor: accent.fill, borderColor: accent.fill },
            ]}
          >
            <Text style={[styles.avatarText, { color: p.isDark ? "#FFFFFF" : accent.onFill }]}>{initial}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.heroGreeting, { color: p.muted }]}>{greeting}</Text>
            <Text style={[styles.heroName, { color: p.text }]} numberOfLines={1}>
              {name}
            </Text>
            {memberSince ? <Text style={[styles.heroMeta, { color: p.muted }]}>{memberSince}</Text> : null}
          </View>
          <Pressable
            onPress={() => {
              tapLight();
              onEdit();
            }}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t("Profilini düzenle", "Edit your profile")}
          >
            <Pencil size={18} color={p.isDark ? "rgba(255,255,255,0.9)" : accent.text} />
          </Pressable>
        </View>

        {needsSetup ? (
          <Pressable
            onPress={onEdit}
            style={[styles.setupChip, { backgroundColor: accent.fill }]}
            accessibilityRole="button"
          >
            <Text style={[styles.setupChipText, { color: accent.onFill }]}>
              {t("Profilini tamamla - koçun seni tanısın", "Complete your profile so your coach knows you")}
            </Text>
            <ChevronRight size={16} color={accent.onFill} />
          </Pressable>
        ) : chips.length > 0 ? (
          <View style={styles.chipRow}>
            {chips.map((chip) => (
              <View
                key={chip}
                style={[
                  styles.chip,
                  p.isDark
                    ? { backgroundColor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.22)" }
                    : { backgroundColor: `${accent.graphic}14`, borderColor: `${accent.graphic}40` },
                ]}
              >
                <Text style={[styles.chipText, { color: p.text }]}>{chip}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {restrictions ? (
          <View style={styles.restrictionRow}>
            <ShieldAlert size={15} color={p.isDark ? "rgba(255,255,255,0.85)" : accent.text} />
            <Text style={[styles.restrictionText, { color: p.text }]} numberOfLines={2}>
              <Text style={styles.restrictionLabel}>{t("Hassasiyetler: ", "Sensitivities: ")}</Text>
              {restrictions}
            </Text>
          </View>
        ) : null}
      </View>
    </GlassShell>
  );
}

// ------------------------------------------------------------ parlak kutular

export const ProfileTile = memo(function ProfileTile({
  tileKey,
  icon,
  label,
  value,
  hint,
  onPress,
}: {
  tileKey: ProfileTileKey;
  icon: (color: string) => ReactNode;
  label: string;
  value: string;
  hint: string;
  onPress: () => void;
}) {
  const p = usePalette();
  const solid = useProfileTileColors()[tileKey];
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [styles.tileWrap, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value} ${hint}`}
    >
      <GlassShell
        gradient={PROFILE_TILE_GRADIENT_DARK[tileKey]}
        lightFill="rgba(255,255,255,0.75)"
        lightGradient={[`${solid}40`, "rgba(255,255,255,0.86)"]}
        glow={p.isDark ? PROFILE_TILE_GRADIENT_DARK[tileKey][0] : solid}
        radius={20}
      >
        <View style={styles.tileBody}>
          <View style={styles.tileLabelRow}>
            {icon(p.isDark ? "rgba(255,255,255,0.9)" : solid)}
            <Text style={[styles.tileLabel, { color: p.text }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
          <Text style={[styles.tileValue, { color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text style={[styles.tileHint, { color: p.isDark ? "rgba(255,255,255,0.88)" : p.c.text }]} numberOfLines={1}>
            {hint}
          </Text>
        </View>
      </GlassShell>
    </Pressable>
  );
});

// ------------------------------------------------------------ hedef özeti

/** SAKİN hedef kartı: "11 hedeften 7'si tamam" + en çok 4 hedef satırı (tamamlanmamışlar
 * önce). Kartın tamamı Hedef Merkezi'ne gider. */
export function ProfileGoalsCard({
  items,
  loading,
  onPress,
}: {
  items: GoalItem[];
  loading: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  const t = useT();
  const accent = useProfileAccent();
  const ownerColors = useGoalOwnerColors();
  const green = useGoalGreen();
  const done = items.filter((item) => item.reached).length;
  // Tamamlanmamışlar önce (en yakın olanlar), sonra tamamlananlar.
  const preview = useMemo(
    () =>
      [...items]
        .sort((a, b) => Number(a.reached) - Number(b.reached) || (b.pct ?? 0) - (a.pct ?? 0))
        .slice(0, 4),
    [items]
  );
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t("Hedef Merkezi'ni aç", "Open Goal Center")}
      style={({ pressed }) => pressed && { opacity: 0.9 }}
    >
      <GlassShell
        gradient={PROFILE_GOALS_GRADIENT_DARK}
        lightFill="rgba(255,255,255,0.85)"
        lightGradient={[`${accent.graphic}1A`, "rgba(255,255,255,0.9)"]}
        glow={p.isDark ? PROFILE_GOALS_GRADIENT_DARK[0] : accent.graphic}
        radius={22}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        subtle
      >
        <View style={styles.goalsBody}>
          <View style={styles.goalsHeader}>
            <Target size={18} color={p.isDark ? "rgba(255,255,255,0.9)" : accent.text} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: p.text }]}>{t("Hedeflerin", "Your Goals")}</Text>
              <Text style={[styles.cardSubtitle, { color: p.muted }]}>
                {loading
                  ? t("Yükleniyor...", "Loading...")
                  : items.length === 0
                    ? t("Henüz hedef yok - Hedef Merkezi'nden ekle", "No goals yet - add them in the Goal Center")
                    : t(`${items.length} hedeften ${done} tanesi tamam`, `${done} of ${items.length} goals done`)}
              </Text>
            </View>
            <ChevronRight size={20} color={p.muted} />
          </View>
          {preview.length > 0 ? (
            <View style={styles.goalGrid}>
              {preview.map((item) => {
                const color = item.reached ? green : ownerColors[item.owner];
                return (
                  <View key={`${item.owner}-${item.key}`} style={styles.goalCell}>
                    <View style={styles.goalCellHead}>
                      {item.reached ? (
                        <Check size={12} color={green} strokeWidth={3} />
                      ) : (
                        <View style={[styles.goalDot, { backgroundColor: color }]} />
                      )}
                      <Text style={[styles.goalCellLabel, { color: p.text }]} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </View>
                    <View style={[styles.goalTrack, { backgroundColor: p.isDark ? "rgba(255,255,255,0.16)" : "rgba(36,29,20,0.08)" }]}>
                      <View style={{ width: `${Math.max(4, item.reached ? 100 : (item.pct ?? 0))}%`, height: 5, borderRadius: 3, backgroundColor: color }} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </GlassShell>
    </Pressable>
  );
}

// ------------------------------------------------------------ koç kartı

/** "Bugün 18:02" / "Dün 09:10" / "3 gün önce" / "12 Eylül" - bildirim zamanı. */
export function relativeDay(iso: string, language: PreferredLanguage, t: (tr: string, en: string) => string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86400000);
  const time = date.toLocaleTimeString(language === "en" ? "en-US" : "tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (days <= 0) return t(`Bugün ${time}`, `Today ${time}`);
  if (days === 1) return t(`Dün ${time}`, `Yesterday ${time}`);
  if (days < 7) return t(`${days} gün önce`, `${days} days ago`);
  return formatDate(iso, language, { day: "numeric", month: "long" });
}

export function CoachNoteCard({
  checkin,
  unread,
  loading,
  onPress,
}: {
  checkin: CheckinMessage | null;
  unread: number;
  loading: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  const t = useT();
  const { language } = useLanguage();
  const KindIcon = checkin?.kind === "weekly_summary" ? CalendarCheck : checkin?.kind === "daily_nudge" ? BellRing : MessageSquareHeart;
  const kindLabel =
    checkin?.kind === "weekly_summary"
      ? t("Haftalık özet", "Weekly summary")
      : checkin?.kind === "daily_nudge"
        ? t("Hatırlatma", "Reminder")
        : t("Koç notu", "Coach note");
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t("Bildirimleri aç", "Open notifications")}
      style={({ pressed }) => pressed && { opacity: 0.9 }}
    >
      <GlassShell
        gradient={PROFILE_INSIGHT_TONE.gradient}
        lightFill={PROFILE_INSIGHT_TONE.lightFill}
        glow={PROFILE_INSIGHT_TONE.glow}
        radius={18}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.coachBody}>
          <View style={styles.coachHeader}>
            <Text style={[styles.coachTitle, { color: p.text }]}>✨ {t("Koçundan Son Not", "Latest From Your Coach")}</Text>
            {unread > 0 ? (
              <View style={[styles.unreadPill, { backgroundColor: p.isDark ? "#FFFFFF" : p.c.text }]}>
                <Text style={[styles.unreadText, { color: p.isDark ? "#2A1848" : "#FFFFFF" }]}>
                  {t(`${unread > 9 ? "9+" : unread} yeni`, `${unread > 9 ? "9+" : unread} new`)}
                </Text>
              </View>
            ) : null}
          </View>
          {loading ? (
            <TypingIndicator color={p.text} size={22} />
          ) : checkin ? (
            <>
              <View style={styles.coachMetaRow}>
                <KindIcon size={13} color={p.text} />
                <Text style={[styles.coachMeta, { color: p.text }]}>
                  {kindLabel} · {relativeDay(checkin.generated_at, language, t)}
                </Text>
              </View>
              <Text style={[styles.coachMessage, { color: p.text }]} numberOfLines={4}>
                {checkin.message}
              </Text>
            </>
          ) : (
            <Text style={[styles.coachMessage, { color: p.text }]}>
              {t(
                "Koçun haftalık ilerleme özetini ve gerektiğinde hatırlatmaları burada bırakacak.",
                "Your coach will leave your weekly progress summary and reminders here."
              )}
            </Text>
          )}
          <View style={styles.coachFooter}>
            <Text style={[styles.coachLink, { color: p.text }]}>{t("Tüm bildirimler", "All notifications")}</Text>
            <ChevronRight size={16} color={p.text} />
          </View>
        </View>
      </GlassShell>
    </Pressable>
  );
}

// ------------------------------------------------------------ başarılar

type BadgeMeta = { icon: typeof Award; tr: string; en: string; descTr: string; descEn: string };

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

export function badgeTitle(key: string, language: PreferredLanguage): string {
  const meta = BADGE_META[key] ?? FALLBACK_META;
  return language === "en" ? meta.en : meta.tr;
}

const BadgeCircle = memo(function BadgeCircle({
  badge,
  selected,
  onPress,
}: {
  badge: AchievementBadge;
  selected: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  const { language } = useLanguage();
  const accent = useProfileAccent();
  const meta = BADGE_META[badge.key] ?? FALLBACK_META;
  const Icon = meta.icon;
  const title = language === "en" ? meta.en : meta.tr;
  const progress = Math.min(1, badge.current / badge.threshold);
  return (
    <Pressable
      onPress={onPress}
      style={styles.badgeItem}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}: ${badge.earned ? (language === "en" ? "earned" : "kazanıldı") : `${Math.min(badge.current, badge.threshold)}/${badge.threshold}`}`}
    >
      <View style={[styles.badgeRing, selected && { borderColor: p.isDark ? "#FFFFFF" : accent.graphic }]}>
        {badge.earned ? (
          p.isDark ? (
            <LinearGradient colors={["#A57BEF", "#5E3A96"]} style={styles.badgeCircle}>
              <Icon size={22} color="#FFFFFF" strokeWidth={2.2} />
            </LinearGradient>
          ) : (
            <View style={[styles.badgeCircle, { backgroundColor: accent.fill }]}>
              <Icon size={22} color={accent.onFill} strokeWidth={2.2} />
            </View>
          )
        ) : (
          <View
            style={[
              styles.badgeCircle,
              {
                backgroundColor: p.isDark ? "rgba(255,255,255,0.07)" : "rgba(36,29,20,0.05)",
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: p.isDark ? "rgba(255,255,255,0.28)" : "rgba(36,29,20,0.22)",
              },
            ]}
          >
            <Icon size={20} color={p.muted} strokeWidth={2} />
          </View>
        )}
      </View>
      <Text style={[styles.badgeLabel, { color: badge.earned ? p.text : p.muted }]} numberOfLines={2}>
        {title}
      </Text>
      {!badge.earned ? (
        <View style={[styles.badgeTrack, { backgroundColor: p.isDark ? "rgba(255,255,255,0.14)" : "rgba(36,29,20,0.08)" }]}>
          <View style={{ width: `${Math.max(6, progress * 100)}%`, height: 4, borderRadius: 2, backgroundColor: accent.graphic }} />
        </View>
      ) : null}
    </Pressable>
  );
});

export function AchievementsPanel({
  badges,
  celebrateKey,
  hint,
}: {
  badges: AchievementBadge[] | null;
  celebrateKey: number;
  hint: string | null;
}) {
  const p = usePalette();
  const t = useT();
  const { language } = useLanguage();
  const ramp = useRampColor();
  const accent = useProfileAccent();
  const green = useGoalGreen();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const earned = badges?.filter((badge) => badge.earned).length ?? 0;
  const selected = badges?.find((badge) => badge.key === selectedKey) ?? null;
  const selectedMeta = selected ? (BADGE_META[selected.key] ?? FALLBACK_META) : null;
  return (
    <GlassShell gradient={[ramp(0.35), ramp(0.6)]} lightFill="rgba(255,255,255,0.82)" radius={22} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} subtle>
      <View style={styles.panelBody}>
        <View style={styles.panelHeader}>
          <Award size={18} color={p.isDark ? accent.text : accent.text} />
          <Text style={[styles.cardTitle, { color: p.text, flex: 1 }]}>{t("Başarıların", "Achievements")}</Text>
          {badges ? (
            <Text style={[styles.panelCount, { color: p.muted }]}>
              {t(`${badges.length} rozetten ${earned}`, `${earned} of ${badges.length}`)}
            </Text>
          ) : null}
        </View>
        {hint ? <Text style={[styles.badgeHint, { color: p.text }]}>{hint}</Text> : null}
        {badges ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
            {badges.map((badge) => (
              <BadgeCircle
                key={badge.key}
                badge={badge}
                selected={badge.key === selectedKey}
                onPress={() => {
                  tapLight();
                  setSelectedKey((current) => (current === badge.key ? null : badge.key));
                }}
              />
            ))}
          </ScrollView>
        ) : (
          <TypingIndicator color={p.text} size={22} />
        )}
        {selected && selectedMeta ? (
          <View style={[styles.badgeDetail, { backgroundColor: p.isDark ? "rgba(255,255,255,0.07)" : `${accent.graphic}12` }]}>
            <Text style={[styles.badgeDetailTitle, { color: p.text }]}>
              {language === "en" ? selectedMeta.en : selectedMeta.tr}
              {selected.earned ? (
                <Text style={{ color: green }}> · {t("Kazanıldı ✓", "Earned ✓")}</Text>
              ) : (
                <Text style={{ color: p.muted }}>
                  {" "}
                  · {Math.min(selected.current, selected.threshold)}/{selected.threshold}
                </Text>
              )}
            </Text>
            <Text style={[styles.badgeDetailText, { color: p.muted }]}>{language === "en" ? selectedMeta.descEn : selectedMeta.descTr}</Text>
          </View>
        ) : null}
      </View>
      <ConfettiBurst replayKey={celebrateKey} />
    </GlassShell>
  );
}

// ------------------------------------------------------------ menü

export interface ProfileMenuItem {
  key: string;
  icon: typeof Award;
  color: string;
  label: string;
  hint?: string;
  badge?: number;
  onPress: () => void;
}

export function ProfileMenuPanel({ items, toneFrom, toneTo }: { items: ProfileMenuItem[]; toneFrom: number; toneTo: number }) {
  const p = usePalette();
  const ramp = useRampColor();
  return (
    <GlassShell gradient={[ramp(toneFrom), ramp(toneTo)]} lightFill="rgba(255,255,255,0.82)" radius={22} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} subtle>
      <View style={styles.menuBody}>
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <View key={item.key}>
              {index > 0 ? <View style={[styles.menuDivider, { backgroundColor: p.isDark ? "rgba(255,255,255,0.10)" : "rgba(36,29,20,0.08)" }]} /> : null}
              <Pressable
                onPress={() => {
                  tapLight();
                  item.onPress();
                }}
                style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
              >
                <View style={[styles.menuIcon, { backgroundColor: `${item.color}26`, borderColor: `${item.color}55` }]}>
                  <Icon size={17} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, { color: p.text }]}>{item.label}</Text>
                  {item.hint ? (
                    <Text style={[styles.menuHint, { color: p.muted }]} numberOfLines={1}>
                      {item.hint}
                    </Text>
                  ) : null}
                </View>
                {item.badge && item.badge > 0 ? (
                  <View style={[styles.menuBadge, { backgroundColor: p.c.error }]}>
                    <Text style={styles.menuBadgeText}>{item.badge > 9 ? "9+" : item.badge}</Text>
                  </View>
                ) : null}
                <ChevronRight size={18} color={p.muted} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </GlassShell>
  );
}

const styles = StyleSheet.create({
  heroBody: { padding: 18, gap: 14 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 24, fontFamily: "Inter_600SemiBold" },
  heroGreeting: { fontSize: 13 },
  heroName: { fontSize: 22, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  heroMeta: { fontSize: 12, marginTop: 2 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -8, marginTop: -8, alignSelf: "flex-start" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  setupChip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: 14, paddingHorizontal: 14 },
  setupChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  restrictionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  restrictionText: { flex: 1, fontSize: 13, lineHeight: 18 },
  restrictionLabel: { fontFamily: "Inter_600SemiBold" },
  tileWrap: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  tileBody: { minHeight: 108, padding: 12, justifyContent: "space-between", gap: 4 },
  tileLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tileLabel: { fontSize: 12, fontFamily: "Inter_500Medium", flexShrink: 1 },
  tileValue: { fontSize: 26, fontFamily: "Inter_500Medium", letterSpacing: -0.5 },
  tileHint: { fontSize: 12 },
  goalsBody: { padding: 16, gap: 12 },
  goalsHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 18, fontFamily: "Inter_500Medium" },
  cardSubtitle: { fontSize: 13, marginTop: 1 },
  goalGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 10 },
  goalCell: { flexGrow: 1, flexBasis: "40%", gap: 5, minWidth: 0 },
  goalCellHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  goalDot: { width: 8, height: 8, borderRadius: 4 },
  goalCellLabel: { fontSize: 13, fontFamily: "Inter_500Medium", flexShrink: 1 },
  goalTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  coachBody: { padding: 18, gap: 8 },
  coachHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  coachTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  unreadPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  unreadText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  coachMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, opacity: 0.9 },
  coachMeta: { fontSize: 12, fontFamily: "Inter_500Medium" },
  coachMessage: { fontSize: 13, lineHeight: 19 },
  coachFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: 2 },
  coachLink: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  panelBody: { padding: 18, gap: 12 },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  panelCount: { fontSize: 13 },
  badgeHint: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  badgeRow: { gap: 6, paddingRight: 4 },
  badgeItem: { width: 76, alignItems: "center", gap: 6 },
  badgeRing: { padding: 3, borderRadius: 32, borderWidth: 2, borderColor: "transparent" },
  badgeCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  badgeLabel: { fontSize: 12, lineHeight: 15, textAlign: "center", fontFamily: "Inter_500Medium" },
  badgeTrack: { width: 44, height: 4, borderRadius: 2, overflow: "hidden" },
  badgeDetail: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  badgeDetailTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  badgeDetailText: { fontSize: 12, lineHeight: 17 },
  menuBody: { paddingHorizontal: 16, paddingVertical: 6 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  menuIcon: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  menuLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  menuHint: { fontSize: 12, marginTop: 1 },
  menuDivider: { height: 1, marginLeft: 48 },
  menuBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  menuBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
});
