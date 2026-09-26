import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, ChevronRight, Dumbbell, MessageCircle, Pencil, Plus, Ruler, ShieldAlert, Utensils } from "lucide-react-native";
import type { ExerciseGoalProgress } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useTheme } from "@/lib/theme-context";
import { tapLight } from "@/lib/haptics";
import { useDebouncedFocusEffect } from "@/lib/use-debounced-focus-effect";
import { DetailScreen, ErrorBanner, Skeleton, useThemeColors } from "@/components/ui";
import { GlassShell } from "@/components/progress-cards";
import { GoalSheet } from "@/components/progress-goal-sheet";
import { WeeklyGoalSheet } from "@/components/weekly-goal";
import { NutritionGoalSheet } from "@/components/nutrition-goal-sheet";
import { ExerciseGoalSheet } from "@/components/exercise-goal-sheet";
import { useGoalGreen } from "@/components/progress-identity";
import {
  NUTRITION_SURFACE_TONE,
  PROFILE_SURFACE_TONE,
  PROGRESS_SURFACE_TONE,
  SurfaceToneProvider,
  WORKOUT_SURFACE_TONE,
  useRampColor,
} from "@/components/surface-tone";
import { latestMetric, useGoalItems, useGoalOverview, type GoalItem, type GoalOwner } from "@/components/goal-overview";
import { useGoalOwnerColors } from "@/components/profile-cards";
import { PROFILE_GOALS_GRADIENT_DARK, useProfileAccent } from "@/components/profile-identity";

// Profil > Hedef Merkezi (2026-09-25, kullanıcı onaylı plan). Önceden bu ekran
// Beslenme/Antrenman/İlerleme'deki hedef formlarının KOPYASIYDI (üç yerde aynı
// form; kalori/makro Stepper'ları 393px'te taşıyordu). Artık salt bir harita:
// her hedef grubu SAHİBİ olan sekmenin kimliğinde gösterilir ve "düzenle" o
// sekmenin KENDİ sheet'ini, o sekmenin yüzey tonuyla açar - hedef tek bir
// yerde tanımlı, burası sadece hepsini bir arada gösterip düzenletiyor.
// Hassasiyet/kısıtlama notu (alerji vb.) Hesap > Genel Bilgiler'de korunuyor,
// Beslenme kartında salt-okunur hatırlatma olarak da görünüyor.

type SheetName = "body" | "weekly" | "nutrition" | "exercise" | null;
// Sheet kapanınca closeSheet zaten yeniden yüklüyor - kayıt sonrası ikinci istek olmasın.
const noop = () => {};

function GoalRow({ item, color, onPress }: { item: GoalItem; color: string; onPress?: () => void }) {
  const { theme } = useTheme();
  const c = useThemeColors();
  const t = useT();
  const green = useGoalGreen();
  const isDark = theme === "dark";
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.78)" : c.muted;
  const fill = item.reached ? green : color;
  const pctText = item.reached ? t("Tamam", "Done") : item.pct != null ? `%${Math.round(item.pct)}` : "–";
  const body = (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={[styles.rowLabel, { color: text }]} numberOfLines={1}>
          {item.label}
        </Text>
        <View style={[styles.pctPill, { backgroundColor: `${fill}${isDark ? "2E" : "1F"}`, borderColor: `${fill}70` }]}>
          {item.reached ? <Check size={12} color={fill} strokeWidth={3} /> : null}
          <Text style={[styles.pctText, { color: isDark ? "#FFFFFF" : c.text }]}>{pctText}</Text>
        </View>
        {onPress ? <ChevronRight size={16} color={muted} /> : null}
      </View>
      <View style={[styles.track, { backgroundColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(36,29,20,0.08)" }]}>
        <View style={{ width: `${Math.max(3, item.reached ? 100 : (item.pct ?? 0))}%`, height: 7, borderRadius: 4, backgroundColor: fill }} />
      </View>
      <Text style={[styles.rowDetail, { color: muted }]}>{item.detail}</Text>
    </View>
  );
  return onPress ? (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}: ${item.detail}`}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}

function OwnerCard({
  color,
  icon,
  title,
  subtitle,
  onEdit,
  editLabel,
  toneFrom,
  toneTo,
  children,
}: {
  color: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onEdit?: () => void;
  editLabel: string;
  toneFrom: number;
  toneTo: number;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const c = useThemeColors();
  const ramp = useRampColor();
  const isDark = theme === "dark";
  return (
    <GlassShell
      gradient={[ramp(toneFrom), ramp(toneTo)]}
      lightFill="rgba(255,255,255,0.85)"
      lightGradient={[`${color}14`, "rgba(255,255,255,0.9)"]}
      glow={isDark ? undefined : color}
      radius={22}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      subtle
    >
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIcon, { backgroundColor: `${color}26`, borderColor: `${color}66` }]}>{icon}</View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: isDark ? "#FFFFFF" : c.text }]}>{title}</Text>
            <Text style={[styles.cardSubtitle, { color: isDark ? "rgba(255,255,255,0.75)" : c.muted }]}>{subtitle}</Text>
          </View>
          {onEdit ? (
            <Pressable
              onPress={() => {
                tapLight();
                onEdit();
              }}
              style={styles.editButton}
              accessibilityRole="button"
              accessibilityLabel={editLabel}
            >
              <Pencil size={17} color={isDark ? "rgba(255,255,255,0.85)" : color} />
            </Pressable>
          ) : null}
        </View>
        {children}
      </View>
    </GlassShell>
  );
}

function EmptyGoal({ text, action, color, onPress }: { text: string; action: string; color: string; onPress: () => void }) {
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.emptyText, { color: isDark ? "rgba(255,255,255,0.78)" : c.muted }]}>{text}</Text>
      <Pressable
        onPress={() => {
          tapLight();
          onPress();
        }}
        style={[styles.outlineButton, { borderColor: `${color}99` }]}
        accessibilityRole="button"
      >
        <Plus size={16} color={isDark ? "#FFFFFF" : color} />
        <Text style={[styles.outlineButtonText, { color: isDark ? "#FFFFFF" : color }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

export default function GoalsScreen() {
  return (
    <SurfaceToneProvider tone={PROFILE_SURFACE_TONE}>
      <GoalCenter />
    </SurfaceToneProvider>
  );
}

function GoalCenter() {
  const { token } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accent = useProfileAccent();
  const green = useGoalGreen();
  const ownerColors = useGoalOwnerColors();
  const { data, error, reload } = useGoalOverview(token);
  const groups = useGoalItems(profile, data);
  // Hesap ve Ayarlar > "Kalori önerini gör" (2026-09-26) beslenme sheet'i açık gelir.
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [sheet, setSheet] = useState<SheetName>(open === "nutrition" ? "nutrition" : null);
  const [editingExercise, setEditingExercise] = useState<ExerciseGoalProgress | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useDebouncedFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const all = useMemo(() => [...groups.progress, ...groups.workouts, ...groups.nutrition], [groups]);
  const done = all.filter((item) => item.reached).length;
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.78)" : c.muted;

  const closeSheet = useCallback(() => {
    setSheet(null);
    setEditingExercise(null);
    // Haftalık gün/kalori hedefi değişince özet (done/goal, bugünkü yüzde)
    // backend'den yeniden okunmalı - profil bağlamı sadece hedef değerini tutar.
    void reload();
  }, [reload]);

  const weeklyItem = groups.workouts.find((item) => item.key === "weekly") ?? null;
  const exerciseItems = groups.workouts.filter((item) => item.key.startsWith("exercise-"));
  const currents = useMemo(
    () => ({
      weight: data ? latestMetric(data.logs, "weight") : null,
      waist: data ? latestMetric(data.logs, "waist_cm") : null,
      fat: data ? latestMetric(data.logs, "body_fat_pct") : null,
    }),
    [data]
  );

  function ownerSubtitle(owner: GoalOwner): string {
    const items = groups[owner];
    if (items.length === 0) return t("Henüz hedef yok", "No goals yet");
    const reached = items.filter((item) => item.reached).length;
    return t(`${items.length} hedef · ${reached} tamam`, `${items.length} goals · ${reached} done`);
  }

  return (
    <DetailScreen title={t("Hedef Merkezi", "Goal Center")} glowHeight={320}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            tintColor={accent.graphic}
            onRefresh={async () => {
              setIsRefreshing(true);
              await reload();
              setIsRefreshing(false);
            }}
          />
        }
      >
        {error ? <ErrorBanner message={error} /> : null}

        {!data ? (
          <>
            <Skeleton height={110} />
            <Skeleton height={200} />
            <Skeleton height={200} />
          </>
        ) : (
          <>
            {/* Özet (sakin ametist): toplam + her hedef için bir dilim - dilim
                rengi hedefin sahibi, tamamlanan yeşil. */}
            <GlassShell
              gradient={PROFILE_GOALS_GRADIENT_DARK}
              lightFill="rgba(255,255,255,0.85)"
              lightGradient={[`${accent.graphic}1F`, "rgba(255,255,255,0.9)"]}
              glow={isDark ? PROFILE_GOALS_GRADIENT_DARK[0] : accent.graphic}
              radius={22}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              subtle
            >
              <View style={styles.summaryBody}>
                <View style={styles.summaryTop}>
                  <Text style={[styles.summaryValue, { color: text }]}>
                    {done}
                    <Text style={[styles.summaryTotal, { color: muted }]}> / {all.length}</Text>
                  </Text>
                  <Text style={[styles.summaryLabel, { color: text }]}>
                    {all.length === 0 ? t("Henüz hedefin yok", "You have no goals yet") : t("hedef tamamlandı", "goals completed")}
                  </Text>
                </View>
                {all.length > 0 ? (
                  <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {all.map((item) => (
                      <View
                        key={`${item.owner}-${item.key}`}
                        style={[
                          styles.segment,
                          { backgroundColor: item.reached ? green : `${ownerColors[item.owner]}${isDark ? "55" : "44"}` },
                        ]}
                      />
                    ))}
                  </View>
                ) : null}
                <Text style={[styles.summaryHint, { color: muted }]}>
                  {t(
                    "Hedefler sekmelerinde yaşar; buradan hepsini görüp düzenleyebilirsin.",
                    "Goals live in their tabs; here you can see and edit them all."
                  )}
                </Text>
              </View>
            </GlassShell>

            <OwnerCard
              color={ownerColors.progress}
              icon={<Ruler size={18} color={ownerColors.progress} />}
              title={t("Vücut", "Body")}
              subtitle={ownerSubtitle("progress")}
              onEdit={groups.progress.length > 0 ? () => setSheet("body") : undefined}
              editLabel={t("Vücut hedeflerini düzenle", "Edit body goals")}
              toneFrom={0}
              toneTo={0.3}
            >
              {groups.progress.length > 0 ? (
                <View style={styles.rows}>
                  {groups.progress.map((item) => (
                    <GoalRow key={item.key} item={item} color={ownerColors.progress} />
                  ))}
                </View>
              ) : (
                <EmptyGoal
                  text={t("Hedef kilo, bel çevresi ya da yağ oranı belirleyebilirsin.", "You can set a target weight, waist or body fat.")}
                  action={t("Vücut hedefi belirle", "Set a body goal")}
                  color={ownerColors.progress}
                  onPress={() => setSheet("body")}
                />
              )}
            </OwnerCard>

            <OwnerCard
              color={ownerColors.workouts}
              icon={<Dumbbell size={18} color={ownerColors.workouts} />}
              title={t("Antrenman", "Workouts")}
              subtitle={ownerSubtitle("workouts")}
              editLabel=""
              toneFrom={0.3}
              toneTo={0.6}
            >
              <View style={styles.rows}>
                {weeklyItem ? (
                  <GoalRow item={weeklyItem} color={ownerColors.workouts} onPress={() => setSheet("weekly")} />
                ) : (
                  <EmptyGoal
                    text={t("Haftada kaç gün antrenman yapmak istediğini belirle.", "Set how many days a week you want to train.")}
                    action={t("Haftalık hedef belirle", "Set a weekly goal")}
                    color={ownerColors.workouts}
                    onPress={() => setSheet("weekly")}
                  />
                )}
                {exerciseItems.length > 0 ? <View style={[styles.divider, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(36,29,20,0.08)" }]} /> : null}
                {exerciseItems.map((item) => {
                  const goal = data.exerciseGoals.find((g) => `exercise-${g.id}` === item.key) ?? null;
                  return (
                    <GoalRow
                      key={item.key}
                      item={item}
                      color={ownerColors.workouts}
                      onPress={
                        goal
                          ? () => {
                              setEditingExercise(goal);
                              setSheet("exercise");
                            }
                          : undefined
                      }
                    />
                  );
                })}
                <Pressable
                  onPress={() => {
                    tapLight();
                    setEditingExercise(null);
                    setSheet("exercise");
                  }}
                  style={[styles.outlineButton, { borderColor: `${ownerColors.workouts}99` }]}
                  accessibilityRole="button"
                >
                  <Plus size={16} color={isDark ? "#FFFFFF" : ownerColors.workouts} />
                  <Text style={[styles.outlineButtonText, { color: isDark ? "#FFFFFF" : ownerColors.workouts }]}>
                    {t("Egzersiz hedefi ekle", "Add exercise goal")}
                  </Text>
                </Pressable>
              </View>
            </OwnerCard>

            <OwnerCard
              color={ownerColors.nutrition}
              icon={<Utensils size={18} color={ownerColors.nutrition} />}
              title={t("Beslenme", "Nutrition")}
              subtitle={groups.nutrition.length > 0 ? t("Bugünkü durum", "Today's status") : ownerSubtitle("nutrition")}
              onEdit={groups.nutrition.length > 0 ? () => setSheet("nutrition") : undefined}
              editLabel={t("Beslenme hedeflerini düzenle", "Edit nutrition goals")}
              toneFrom={0.6}
              toneTo={0.9}
            >
              {groups.nutrition.length > 0 ? (
                <View style={styles.rows}>
                  {groups.nutrition.map((item) => (
                    <GoalRow key={item.key} item={item} color={ownerColors.nutrition} />
                  ))}
                </View>
              ) : (
                <EmptyGoal
                  text={t("Günlük kalori ve makro hedeflerini belirleyebilirsin.", "You can set daily calorie and macro goals.")}
                  action={t("Beslenme hedefi belirle", "Set a nutrition goal")}
                  color={ownerColors.nutrition}
                  onPress={() => setSheet("nutrition")}
                />
              )}
              {profile?.dietary_restrictions ? (
                <Pressable
                  onPress={() => router.push("/profile-settings")}
                  style={[styles.restriction, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : `${ownerColors.nutrition}12` }]}
                  accessibilityRole="button"
                  accessibilityHint={t("Hesap ekranında düzenlenir", "Edited on the account screen")}
                >
                  <ShieldAlert size={15} color={isDark ? "rgba(255,255,255,0.85)" : ownerColors.nutrition} />
                  <Text style={[styles.restrictionText, { color: text }]} numberOfLines={2}>
                    <Text style={{ fontFamily: "Inter_600SemiBold" }}>{t("Hassasiyetler: ", "Sensitivities: ")}</Text>
                    {profile.dietary_restrictions}
                  </Text>
                  <ChevronRight size={16} color={muted} />
                </Pressable>
              ) : null}
            </OwnerCard>

            <View style={styles.hintRow}>
              <MessageCircle size={14} color={c.muted} />
              <Text style={[styles.hintText, { color: c.muted }]}>
                {t(
                  'Hedeflerini sohbetten de söyleyebilirsin (ör. "squat\'ta 100 kiloya ulaşmak istiyorum").',
                  'You can also tell your coach in chat (e.g. "I want to squat 100 kg").'
                )}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Her sheet SAHİBİ olan sekmenin yüzey tonunda açılır. */}
      <SurfaceToneProvider tone={PROGRESS_SURFACE_TONE}>
        <GoalSheet visible={sheet === "body"} onClose={closeSheet} currents={currents} />
      </SurfaceToneProvider>
      <SurfaceToneProvider tone={WORKOUT_SURFACE_TONE}>
        <WeeklyGoalSheet visible={sheet === "weekly"} onClose={closeSheet} />
        <ExerciseGoalSheet
          visible={sheet === "exercise"}
          onClose={closeSheet}
          editingGoal={editingExercise}
          onSaved={noop}
          allowDelete
        />
      </SurfaceToneProvider>
      <SurfaceToneProvider tone={NUTRITION_SURFACE_TONE}>
        <NutritionGoalSheet visible={sheet === "nutrition"} onClose={closeSheet} />
      </SurfaceToneProvider>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  summaryBody: { padding: 18, gap: 12 },
  summaryTop: { flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  summaryValue: { fontSize: 34, fontFamily: "Inter_500Medium", letterSpacing: -0.5 },
  summaryTotal: { fontSize: 20, fontFamily: "Inter_500Medium" },
  summaryLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  segments: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
  summaryHint: { fontSize: 12, lineHeight: 17 },
  cardBody: { padding: 18, gap: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 18, fontFamily: "Inter_500Medium" },
  cardSubtitle: { fontSize: 13, marginTop: 1 },
  editButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  rows: { gap: 14 },
  row: { gap: 6 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 26 },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  pctPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  pctText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  track: { height: 7, borderRadius: 4, overflow: "hidden" },
  rowDetail: { fontSize: 12 },
  divider: { height: 1 },
  emptyText: { fontSize: 13, lineHeight: 18 },
  outlineButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: 14, borderWidth: 1.5 },
  outlineButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  restriction: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, paddingVertical: 8 },
  restrictionText: { flex: 1, fontSize: 13, lineHeight: 18 },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 },
  hintText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
