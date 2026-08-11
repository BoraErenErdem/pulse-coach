import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Check, Pencil, Plus, Trash2, Trophy, X } from "lucide-react-native";
import {
  ApiError,
  CARDIO_CATEGORIES,
  CARDIO_CATEGORY_LABELS,
  INTENSITIES,
  INTENSITY_LABELS,
  WORKOUT_TYPES,
  deleteWorkoutSession,
  deleteWorkoutSet,
  getExerciseGoals,
  getWorkoutSessions,
  getWorkoutSummary,
  logWorkoutSession,
  searchExercises,
  updateWorkoutSession,
  updateWorkoutSet,
  type CardioCategory,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
  type Intensity,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutSetInput,
  type WorkoutSummary,
  type WorkoutType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { parseLocaleNumber } from "@/lib/format";
import {
  Card,
  ChipSelect,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  WORKOUT_TYPE_LABELS,
  colors,
  seriesColors,
} from "@/components/ui";
import { ExerciseGoalsList } from "@/components/exercise-goals-list";
import { SearchableSelect } from "@/components/searchable-select";
import { WorkoutTypeChart } from "@/components/charts/workout-type-chart";
import { WorkoutVolumeChart } from "@/components/charts/workout-volume-chart";

// web/src/app/(app)/workouts/page.tsx'in mobil portu - Faz M4 ilk yarısı.

export default function WorkoutsTab() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exerciseGoals, setExerciseGoals] = useState<ExerciseGoalProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [workoutType, setWorkoutType] = useState<WorkoutType>("kuvvet");
  // Antrenman türü kardiyo/esneklik ise set bazında süre+yoğunluk sorulur,
  // kuvvet/karışık'ta tekrar+kilo (2026-08-06, kullanıcı isteği). Kardiyo
  // seçiliyken kullanıcı ALTTA bir kategori (koşu/bisiklet/...) de seçer,
  // esneklik'te kategori sabittir (tek seçenek). Kalori tahmini backend'de
  // MET yöntemiyle hesaplanıyor - bkz. backend/app/services/met_reference.py.
  const isDurationMode = workoutType === "kardiyo" || workoutType === "esneklik";
  const [exerciseName, setExerciseName] = useState("");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("");
  const [duration, setDuration] = useState("30");
  const [intensity, setIntensity] = useState<Intensity>("orta");
  const [cardioCategory, setCardioCategory] = useState<CardioCategory>("kosu");
  const [pendingSets, setPendingSets] = useState<WorkoutSetInput[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editIntensity, setEditIntensity] = useState<Intensity>("orta");
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editSessionType, setEditSessionType] = useState<WorkoutType>("kuvvet");
  const [editSessionNote, setEditSessionNote] = useState("");

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [summaryData, sessionsData, exerciseGoalsData] = await Promise.all([
        getWorkoutSummary(token, 7),
        getWorkoutSessions(token, 90),
        getExerciseGoals(token),
      ]);
      setSummary(summaryData);
      setSessions(sessionsData);
      setExerciseGoals(exerciseGoalsData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function handleAddSet() {
    setFormError(null);
    if (!exerciseName.trim()) {
      setFormError(t("Egzersiz adı girmelisin.", "You need to enter an exercise name."));
      return;
    }

    if (isDurationMode) {
      const durationNumber = parseLocaleNumber(duration);
      if (!durationNumber || durationNumber <= 0) {
        setFormError(t("Süre sıfırdan büyük olmalı.", "Duration must be greater than zero."));
        return;
      }
      const category: CardioCategory = workoutType === "esneklik" ? "esneklik" : cardioCategory;
      setPendingSets((prev) => [
        ...prev,
        {
          exercise_name: exerciseName.trim(),
          duration_minutes: durationNumber,
          intensity,
          cardio_category: category,
        },
      ]);
      setDuration("30");
      return;
    }

    const repsNumber = parseLocaleNumber(reps);
    if (!repsNumber || repsNumber <= 0) {
      setFormError(t("Tekrar sayısı sıfırdan büyük olmalı.", "Rep count must be greater than zero."));
      return;
    }
    const weightNumber = weight ? parseLocaleNumber(weight) : undefined;
    if (weight && Number.isNaN(weightNumber)) {
      setFormError(t("Geçerli bir kilo değeri gir.", "Enter a valid weight value."));
      return;
    }
    setPendingSets((prev) => [
      ...prev,
      { exercise_name: exerciseName.trim(), reps: repsNumber, weight_kg: weightNumber },
    ]);
    setReps("10");
    setWeight("");
  }

  function handleRemoveSet(index: number) {
    setPendingSets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (pendingSets.length === 0) {
      setFormError(t("Kaydetmeden önce en az bir set eklemelisin.", "You need to add at least one set before saving."));
      return;
    }

    setIsSubmitting(true);
    try {
      await logWorkoutSession(token, { workout_type: workoutType, sets: pendingSets });
      setFormSuccess(t("Antrenman kaydedildi!", "Workout saved!"));
      setPendingSets([]);
      setExerciseName("");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function replaceSession(updated: WorkoutSession) {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleDeleteSession(sessionId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      await deleteWorkoutSession(token, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  function handleStartEditSession(session: WorkoutSession) {
    setEditingSessionId(session.id);
    setEditSessionType((session.workout_type as WorkoutType) ?? "kuvvet");
    setEditSessionNote(session.note ?? "");
  }

  async function handleSaveSession(sessionId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = await updateWorkoutSession(token, sessionId, {
        workout_type: editSessionType,
        note: editSessionNote,
      });
      replaceSession(updated);
      setEditingSessionId(null);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Güncellenemedi, tekrar dener misin?", "Couldn't update, want to try again?"));
    }
  }

  function handleStartEditSet(set: WorkoutSet) {
    setEditingSetId(set.id);
    if (set.duration_minutes != null) {
      setEditDuration(String(set.duration_minutes));
      setEditIntensity(set.intensity ?? "orta");
    } else {
      setEditReps(set.reps != null ? String(set.reps) : "");
      setEditWeight(set.weight_kg != null ? String(set.weight_kg) : "");
    }
  }

  async function handleSaveSet(sessionId: number, setId: number, isDurationSet: boolean) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = isDurationSet
        ? await updateWorkoutSet(token, sessionId, setId, {
            duration_minutes: parseLocaleNumber(editDuration),
            intensity: editIntensity,
          })
        : await updateWorkoutSet(token, sessionId, setId, {
            reps: parseLocaleNumber(editReps),
            weight_kg: editWeight ? parseLocaleNumber(editWeight) : undefined,
          });
      replaceSession(updated);
      setEditingSetId(null);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Güncellenemedi, tekrar dener misin?", "Couldn't update, want to try again?"));
    }
  }

  async function handleDeleteSet(sessionId: number, setId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = await deleteWorkoutSet(token, sessionId, setId);
      replaceSession(updated);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t("Antrenman", "Workouts")}</Text>

          {loadError ? <ErrorBanner message={loadError} /> : null}

          {isLoading ? (
            <View style={styles.statGrid}>
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
            </View>
          ) : (
            <View style={styles.statGrid}>
              <StatTile label={t("Bu Hafta Oturum", "Sessions This Week")} value={String(summary?.session_count ?? 0)} color={seriesColors.series2} />
              <StatTile label={t("Bu Hafta Set", "Sets This Week")} value={String(summary?.total_sets ?? 0)} color={seriesColors.series3} />
              <StatTile
                label={t("Toplam Hacim", "Total Volume")}
                value={`${(summary?.total_volume_kg ?? 0).toFixed(0)} kg`}
                color={seriesColors.series1}
              />
              {summary && summary.total_calories_burned > 0 ? (
                <StatTile
                  label={t("Yakılan Kalori", "Calories Burned")}
                  value={`~${summary.total_calories_burned.toFixed(0)} kcal`}
                  color={seriesColors.series5}
                />
              ) : null}
            </View>
          )}

          {!isLoading && summary ? (
            <InfoBanner
              message={
                summary.session_count > 0
                  ? summary.summary_text
                  : t(
                      "Henüz bu hafta bir antrenman kaydı yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin.",
                      "No workout logged this week yet. You can add your first entry using the form below."
                    )
              }
            />
          ) : null}

          {!isLoading && exerciseGoals.length > 0 ? (
            <Card>
              <Text style={styles.cardTitle}>{t("Egzersiz Hedefleri", "Exercise Goals")}</Text>
              <ExerciseGoalsList goals={exerciseGoals} />
            </Card>
          ) : null}

          <Card>
            <Text style={styles.cardTitle}>{t("Antrenman Kaydet", "Log Workout")}</Text>
            {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
            {formError ? <ErrorBanner message={formError} /> : null}

            <View>
              <FormLabel>{t("Antrenman Türü", "Workout Type")}</FormLabel>
              <ChipSelect options={WORKOUT_TYPES} value={workoutType} onChange={setWorkoutType} labels={WORKOUT_TYPE_LABELS[language]} />
            </View>

            <View>
              <FormLabel>{t("Egzersiz", "Exercise")}</FormLabel>
              <SearchableSelect<ExerciseCatalogItem>
                selectedLabel={exerciseName}
                onQueryChange={setExerciseName}
                onSearch={(query) => (token ? searchExercises(token, query) : Promise.resolve([]))}
                onSelect={(item) => setExerciseName(catalogDisplayName(item, language))}
                getLabel={(item) => catalogDisplayName(item, language)}
                getKey={(item) => item.id}
                placeholder={t("Egzersiz adı yaz...", "Type exercise name...")}
              />
            </View>

            {isDurationMode ? (
              <>
                {workoutType === "kardiyo" ? (
                  <View>
                    <FormLabel>{t("Kardiyo Türü", "Cardio Type")}</FormLabel>
                    <ChipSelect
                      options={CARDIO_CATEGORIES}
                      value={cardioCategory}
                      onChange={setCardioCategory}
                      labels={CARDIO_CATEGORY_LABELS[language]}
                    />
                  </View>
                ) : null}
                <View style={styles.repsWeightRow}>
                  <View style={{ flex: 1 }}>
                    <FormLabel>{t("Süre (dakika)", "Duration (minutes)")}</FormLabel>
                    <FormInput value={duration} onChangeText={setDuration} keyboardType="number-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormLabel>{t("Yoğunluk", "Intensity")}</FormLabel>
                    <ChipSelect options={INTENSITIES} value={intensity} onChange={setIntensity} labels={INTENSITY_LABELS[language]} />
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.repsWeightRow}>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Tekrar", "Reps")}</FormLabel>
                  <FormInput value={reps} onChangeText={setReps} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Kilo (kg)", "Weight (kg)")}</FormLabel>
                  <FormInput value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder={t("opsiyonel", "optional")} />
                </View>
              </View>
            )}

            <Pressable onPress={handleAddSet} style={styles.secondaryButton}>
              <Plus size={16} color={colors.accent} />
              <Text style={styles.secondaryButtonText}>{t("Set Ekle", "Add Set")}</Text>
            </Pressable>

            {pendingSets.length > 0 ? (
              <View style={{ gap: 6 }}>
                {pendingSets.map((set, index) => (
                  <View key={index} style={styles.pendingRow}>
                    <Text style={styles.pendingText}>
                      {set.duration_minutes != null
                        ? `${set.exercise_name} — ${set.duration_minutes} ${t("dk", "min")}${
                            set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""
                          }`
                        : `${set.exercise_name} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                    </Text>
                    <Pressable onPress={() => handleRemoveSet(index)} hitSlop={8}>
                      <Trash2 size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <PrimaryButton onPress={handleSubmit} disabled={isSubmitting || pendingSets.length === 0} loading={isSubmitting}>
              {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Oturumu Kaydet", "Save Session")}
            </PrimaryButton>
            {pendingSets.length === 0 ? (
              <Text style={styles.hintText}>
                {t(
                  'Kaydetmeden önce en az bir set eklemelisin — yukarıdaki "Set Ekle"yi kullan.',
                  'You need to add at least one set before saving — use "Add Set" above.'
                )}
              </Text>
            ) : null}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>{t("Geçmiş Kayıtlar", "History")}</Text>
            {historyError ? <ErrorBanner message={historyError} /> : null}
            {isLoading ? (
              <Skeleton height={140} />
            ) : sessions.length === 0 ? (
              <Text style={styles.emptyText}>
                {t(
                  "Henüz bir antrenman kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.",
                  "No workout logged yet. You can add your first entry using the form above."
                )}
              </Text>
            ) : (
              <View style={{ gap: 12 }}>
                {[...sessions].reverse().map((session) => (
                  <View key={session.id} style={styles.sessionCard}>
                    {editingSessionId === session.id ? (
                      <View style={styles.sessionEditRow}>
                        <ChipSelect
                          options={WORKOUT_TYPES}
                          value={editSessionType}
                          onChange={setEditSessionType}
                          labels={WORKOUT_TYPE_LABELS[language]}
                        />
                        <FormInput
                          value={editSessionNote}
                          onChangeText={setEditSessionNote}
                          placeholder={t("Not (opsiyonel)", "Note (optional)")}
                        />
                        <View style={styles.iconRow}>
                          <Pressable onPress={() => handleSaveSession(session.id)} hitSlop={8}>
                            <Check size={18} color={colors.success} />
                          </Pressable>
                          <Pressable onPress={() => setEditingSessionId(null)} hitSlop={8}>
                            <X size={18} color={colors.error} />
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.sessionHeaderRow}>
                        <Text style={styles.sessionHeaderText}>
                          {session.session_date}
                          {session.workout_type
                            ? ` — ${WORKOUT_TYPE_LABELS[language][session.workout_type as WorkoutType] ?? session.workout_type}`
                            : ""}
                          {session.note ? ` (${session.note})` : ""}
                        </Text>
                        <View style={styles.iconRow}>
                          <Pressable onPress={() => handleStartEditSession(session)} hitSlop={8}>
                            <Pencil size={16} color={colors.muted} />
                          </Pressable>
                          <Pressable onPress={() => handleDeleteSession(session.id)} hitSlop={8}>
                            <Trash2 size={16} color={colors.muted} />
                          </Pressable>
                        </View>
                      </View>
                    )}

                    <View style={{ gap: 6, marginTop: 8 }}>
                      {session.sets.map((set) => {
                        const isDurationSet = set.duration_minutes != null;
                        return (
                          <View key={set.id} style={styles.setRow}>
                            {editingSetId === set.id ? (
                              isDurationSet ? (
                                <View style={styles.setEditRow}>
                                  <Text style={styles.setEditName}>{set.exercise_name_snapshot}</Text>
                                  <FormInput
                                    value={editDuration}
                                    onChangeText={setEditDuration}
                                    keyboardType="number-pad"
                                    style={{ width: 56 }}
                                  />
                                  <Text style={styles.setEditUnit}>{t("dk", "min")}</Text>
                                  <ChipSelect
                                    options={INTENSITIES}
                                    value={editIntensity}
                                    onChange={setEditIntensity}
                                    labels={INTENSITY_LABELS[language]}
                                  />
                                  <Pressable onPress={() => handleSaveSet(session.id, set.id, true)} hitSlop={8}>
                                    <Check size={16} color={colors.success} />
                                  </Pressable>
                                  <Pressable onPress={() => setEditingSetId(null)} hitSlop={8}>
                                    <X size={16} color={colors.error} />
                                  </Pressable>
                                </View>
                              ) : (
                                <View style={styles.setEditRow}>
                                  <Text style={styles.setEditName}>{set.exercise_name_snapshot}</Text>
                                  <FormInput
                                    value={editReps}
                                    onChangeText={setEditReps}
                                    keyboardType="number-pad"
                                    style={{ width: 56 }}
                                  />
                                  <Text style={styles.setEditUnit}>{t("tekrar", "reps")}</Text>
                                  <FormInput
                                    value={editWeight}
                                    onChangeText={setEditWeight}
                                    keyboardType="numeric"
                                    placeholder={t("kg", "kg")}
                                    style={{ width: 64 }}
                                  />
                                  <Pressable onPress={() => handleSaveSet(session.id, set.id, false)} hitSlop={8}>
                                    <Check size={16} color={colors.success} />
                                  </Pressable>
                                  <Pressable onPress={() => setEditingSetId(null)} hitSlop={8}>
                                    <X size={16} color={colors.error} />
                                  </Pressable>
                                </View>
                              )
                            ) : (
                              <>
                                <View style={styles.setLabelRow}>
                                  <Text style={styles.setText}>
                                    {isDurationSet
                                      ? `${set.exercise_name_snapshot} — ${set.duration_minutes} ${t("dk", "min")}${
                                          set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""
                                        }${set.estimated_calories ? ` — ~${set.estimated_calories.toFixed(0)} kcal` : ""}`
                                      : `${set.exercise_name_snapshot} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                                  </Text>
                                  {set.is_personal_record ? (
                                    <View style={styles.recordBadge}>
                                      <Trophy size={11} color="#b45309" />
                                      <Text style={styles.recordText}>{t("Rekor", "Record")}</Text>
                                    </View>
                                  ) : null}
                                </View>
                                <View style={styles.iconRow}>
                                  <Pressable onPress={() => handleStartEditSet(set)} hitSlop={8}>
                                    <Pencil size={14} color={colors.muted} />
                                  </Pressable>
                                  <Pressable onPress={() => handleDeleteSet(session.id, set.id)} hitSlop={8}>
                                    <Trash2 size={14} color={colors.muted} />
                                  </Pressable>
                                </View>
                              </>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>{t("Antrenman Türü Dağılımı", "Workout Type Distribution")}</Text>
            {isLoading ? <Skeleton height={200} /> : <WorkoutTypeChart sessions={sessions} />}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>{t("Ağırlık Hacmi Trendi", "Weight Volume Trend")}</Text>
            {isLoading ? <Skeleton height={200} /> : <WorkoutVolumeChart sessions={sessions} />}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  repsWeightRow: { flexDirection: "row", gap: 10 },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
  },
  secondaryButtonText: { color: colors.accent, fontWeight: "600", fontSize: 14 },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pendingText: { fontSize: 13, color: colors.text, flex: 1 },
  hintText: { fontSize: 12, color: colors.muted },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 12 },
  sessionCard: {
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
  },
  sessionEditRow: { gap: 8 },
  sessionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sessionHeaderText: { fontSize: 13, fontWeight: "600", color: colors.text, flex: 1, marginRight: 8 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  setEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
  setEditName: { fontSize: 12, color: colors.muted },
  setEditUnit: { fontSize: 11, color: colors.muted },
  setLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" },
  setText: { fontSize: 13, color: colors.text },
  recordBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fef3c7",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recordText: { fontSize: 10, fontWeight: "600", color: "#b45309" },
});
