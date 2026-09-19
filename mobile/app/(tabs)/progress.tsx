import { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getFloatingTabBarClearance } from "@/components/nav-icons";
import { useFocusEffect } from "@react-navigation/native";
import { CalendarDays, Check, Dumbbell, Flame, Pencil, PersonStanding, Scale, Trash2, X } from "lucide-react-native";
import {
  ApiError,
  deleteProgressLog,
  getBodyCompositionInsight,
  getProgressLogs,
  getTrends,
  getWeeklySummary,
  logProgress,
  updateProgressLog,
  type PreferredLanguage,
  type ProgressLog,
  type Trends,
  type WeeklySummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { groupEntriesByDate } from "@/lib/date-grouping";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useTheme } from "@/lib/theme-context";
import { parseLocaleNumber } from "@/lib/format";
import {
  AnimatedStreakCount,
  EmptyState,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  PulseStreak,
  Reveal,
  Skeleton,
  SuccessBanner,
  type ThemeColors,
  useThemeColors,
  WORKOUT_TYPE_LABELS,
} from "@/components/ui";
import {
  ProgressFormCard,
  ProgressInsight,
  ProgressNote,
  ProgressSectionCard,
  ProgressTextButton,
  ProgressTile,
  stackTone,
  WeightGoalCard,
} from "@/components/progress-cards";
import { tapLight } from "@/lib/haptics";
import { SwipeableRow } from "@/components/swipeable-row";
import { BodyMetricsPanel, MonthlyTrendPanel } from "@/components/progress-charts";

// web/src/app/(app)/progress/page.tsx'in mobil portu - Faz M3, chart
// kütüphanesinin ilk canlı testi burada (plan kararı: erken, ekran sayısı azken).
// 2026-08-06 (Faz B): "Bugün antrenman yaptım" checkbox'ı + "Antrenman Türü
// Dağılımı" grafiği kaldırıldı - Antrenman sekmesindeki gerçek set/oturum
// kaydıyla bağımsız ve zayıf bir kopyası gibi duruyordu (kullanıcı bulgusu).
// Form artık SADECE kilo girişi; tür dağılımı grafiği Antrenman sekmesine
// taşındı (WorkoutSession bazlı, daha doğru).
function correlationInsightText(correlation: number | null, language: PreferredLanguage): string {
  if (correlation === null) {
    return language === "en"
      ? "At least 4 weeks of both mood and workout logs are needed to see a meaningful pattern."
      : "Anlamlı bir örüntü görebilmek için en az 4 haftalık hem ruh hali hem antrenman kaydı gerekiyor.";
  }
  if (correlation >= 0.3) {
    return language === "en"
      ? `Your mood tends to look better in weeks when you work out (correlation: ${correlation.toFixed(2)}). This isn't proof of causation, just an observed pattern.`
      : `Antrenman yaptığın haftalarda ruh halin genelde daha iyi görünüyor (korelasyon: ${correlation.toFixed(2)}). Bu bir nedensellik kanıtı değil, sadece gözlemlenen bir örüntü.`;
  }
  if (correlation <= -0.3) {
    return language === "en"
      ? `There's a pattern in this period where mood looks lower as workout days increase (correlation: ${correlation.toFixed(2)}) — other factors (e.g. fatigue, program intensity) may be at play.`
      : `Bu dönemde antrenman günleri arttıkça ruh halinin daha düşük göründüğü bir örüntü var (korelasyon: ${correlation.toFixed(2)}) — başka etkenler (ör. yorgunluk, program yoğunluğu) rol oynuyor olabilir.`;
  }
  return language === "en"
    ? `There's no clear pattern between workout days and your mood (correlation: ${correlation.toFixed(2)}).`
    : `Antrenman günleri ile ruh halin arasında belirgin bir örüntü görünmüyor (korelasyon: ${correlation.toFixed(2)}).`;
}

function weightHint(summary: WeeklySummary | null, language: PreferredLanguage): string | undefined {
  if (!summary || summary.weight_start === null || summary.weight_end === null) return undefined;
  if (summary.weight_start === summary.weight_end) {
    return language === "en" ? "Unchanged this week" : "Bu hafta değişmedi";
  }
  return language === "en"
    ? `${summary.weight_start} kg to ${summary.weight_end} kg`
    : `${summary.weight_start} kg'dan ${summary.weight_end} kg'a`;
}

// Backend'in `summary_text`'i tür dağılımını da bir cümle olarak içeriyor
// ("Antrenman türü dağılımı: kuvvet: 2.") - bu metin agent/sohbet bağlamında
// da kullanıldığı için backend'e DOKUNULMADI. İçgörü kartı tür dağılımını
// sağ sütunda ayrıca gösterdiğinde aynı bilgi iki kez çıkmasın diye o cümle
// burada ayıklanıyor.
function withoutWorkoutTypeSentence(text: string): string {
  return text.replace(/\s*(?:Antrenman türü dağılımı|Workout type breakdown):[^.]*\./i, "");
}

function currentWeightOf(logs: ProgressLog[]): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].weight !== null) return logs[i].weight;
  }
  return null;
}

// Tasarım turu (2026-09-19): "Kilo Hedefi" kartının alt notu - mockup'taki
// bağımsız cümle ("3.0 kg alınması gerekiyor"), eski satır-içi "(...)"/"—"
// biçimi kartın yeni yerleşiminde yetim kalırdı.
function weightGoalRemainingText(current: number, target: number, language: PreferredLanguage): string {
  const diff = current - target;
  if (Math.abs(diff) < 0.1) return language === "en" ? "You've reached your goal!" : "Hedefine ulaştın!";
  if (diff > 0) {
    return language === "en" ? `${diff.toFixed(1)} kg to lose` : `${diff.toFixed(1)} kg verilmesi gerekiyor`;
  }
  return language === "en" ? `${Math.abs(diff).toFixed(1)} kg to gain` : `${Math.abs(diff).toFixed(1)} kg alınması gerekiyor`;
}

// "Geçmiş Kayıtlar" listesi zamanla çok uzayıp özellikle mobilde görsel
// olarak bunaltıcı oluyordu (2026-08-14, kullanıcı isteği) - kademeli
// yükleme + gün başlıklarına gruplama (web ile AYNI desen). Web'de HÂLÂ
// 20 (kullanıcı web'den şikayet etmedi) - mobile'da kullanıcı 20'yi de
// 10'u da şişkin bulup 5'e düşürttü (aynı gün, kademeli 3 tur telefon
// testi: 20 -> 10 -> 5).
const HISTORY_PAGE_SIZE = 5;

export default function ProgressTab() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  // profil artık ProfileProvider'dan paylaşımlı - bu ekran ARTIK kendi
  // getProfile çağrısını yapmıyor (2026-08-10 mimari borç raporu, bulgu #7).
  const { profile } = useProfile();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(c, insets.bottom, isDark), [c, insets.bottom, isDark]);
  // Koyu modda paneller sıcak kahve - ortak `c.muted` (soğuk teal-gri) bu
  // zeminde düşük kontrastlı kalıyordu, panel içi ikincil metin/ikon için
  // krem-beyaz tonu.
  const panelMuted = isDark ? "rgba(255,255,255,0.72)" : c.muted;
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  // "Seri" kartına/animasyonlu geri bildirime her dokunuşta artıyor -
  // PulseStreak'in noktalarını YENİDEN oynatmak ve AnimatedStreakCount'u
  // SIÇRATMAK için (kullanıcı isteği, 2026-08-19: "streak kısmına dokununca
  // daha güzel animasyonla streak belli olsun"). Sayı dokunmada 0'dan
  // saymıyor, yerinde kalıp sıçrıyor (2026-09-19 kararı, bkz. ui.tsx) -
  // bkz. rhythm-ring.tsx::AnimatedRing'teki AYNI replayKey ilkesi.
  const [streakReplayKey, setStreakReplayKey] = useState(0);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [weight, setWeight] = useState("");
  const [waistCm, setWaistCm] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bodyCompositionInsight, setBodyCompositionInsight] = useState<string | null>(null);

  // Geçmiş kayıtlar (düzenle/sil) - 2026-08-11 kullanıcı bulgusu: bu ekranda
  // ÖNCEDEN hiç kayıt listesi yoktu, sadece grafik vardı - yanlış girilen
  // bir kilo/bel/yağ kaydını düzeltmenin/silmenin yolu hiç yoktu (Antrenman/
  // Beslenme sekmelerinin "Geçmiş Kayıtlar" kartının aksine).
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editWaistCm, setEditWaistCm] = useState("");
  const [editBodyFatPct, setEditBodyFatPct] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // "Geçmiş Kayıtlar" listesi için BAĞIMSIZ, sayfalı bir veri akışı -
  // grafikleri besleyen `logs`/getProgressLogs(token, 90) çağrısından
  // KASITLI OLARAK ayrı (2026-08-14, kullanıcı isteği: uzun listeler görsel
  // olarak bunaltıcıydı). `logs`'u limit'e çevirmek WeightChart/WaistChart/
  // BodyFatChart'ın 90 günlük trendini kırardı.
  const [historyItems, setHistoryItems] = useState<ProgressLog[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

  const loadHistoryPage = useCallback(
    async (offset: number, replace: boolean) => {
      if (!token) return;
      const page = await getProgressLogs(token, undefined, HISTORY_PAGE_SIZE, offset, true);
      const newestFirst = [...page].reverse();
      setHistoryItems((prev) => (replace ? newestFirst : [...prev, ...newestFirst]));
      setHasMoreHistory(page.length === HISTORY_PAGE_SIZE);
      setHistoryOffset(offset + page.length);
    },
    [token]
  );

  async function handleLoadMoreHistory() {
    setIsLoadingMoreHistory(true);
    try {
      await loadHistoryPage(historyOffset, false);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Yüklenemedi, tekrar dener misin?", "Couldn't load, want to try again?"));
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [summaryData, logsData, trendsData, bodyCompData] = await Promise.all([
        getWeeklySummary(token),
        getProgressLogs(token, 90),
        getTrends(token, 12),
        getBodyCompositionInsight(token),
        loadHistoryPage(0, true),
      ]);
      setSummary(summaryData);
      setLogs(logsData);
      setTrends(trendsData);
      setBodyCompositionInsight(bodyCompData.message);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t, loadHistoryPage]);

  // Diğer sekmelerde (ör. Sohbet'te mood değiştirme) yapılan değişiklikler
  // bu sekmeye geri dönülünce görünsün diye - plain useEffect SADECE ilk
  // mount'ta çalışırdı, tab'lar arası geçişte ekran bellekte kaldığı için
  // veri bayatlıyordu (canlı testte bulundu: mood değiştirip Aylar Arası
  // Trend'e bakınca hiç değişmemiş görünüyordu).
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleSubmit() {
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!weight) {
      setFormError(t("Kaydetmek için bir kilo değeri girmelisin.", "You need to enter a weight value to save."));
      return;
    }

    // RN'in decimal-pad klavyesi tr-TR yerelinde "," gösteriyor ama Number()
    // "," ile ondalık ayrıştıramıyor (Number("78,5") -> NaN) - web'de HTML
    // input[type=number] bunu otomatik normalize ettiği için hiç görülmeyen,
    // mobile'a özgü bir bug (canlı testte bulundu).
    const parsedWeight = parseLocaleNumber(weight);
    if (Number.isNaN(parsedWeight)) {
      setFormError(t("Geçerli bir kilo değeri gir (ör. 78.5).", "Enter a valid weight value (e.g. 78.5)."));
      return;
    }

    // Bel çevresi/vücut yağ oranı opsiyonel - boşsa hiç doğrulanmaz/gönderilmez.
    const parsedWaist = waistCm ? parseLocaleNumber(waistCm) : undefined;
    if (waistCm && Number.isNaN(parsedWaist)) {
      setFormError(t("Geçerli bir bel çevresi değeri gir.", "Enter a valid waist value."));
      return;
    }
    const parsedBodyFat = bodyFatPct ? parseLocaleNumber(bodyFatPct) : undefined;
    if (bodyFatPct && Number.isNaN(parsedBodyFat)) {
      setFormError(t("Geçerli bir vücut yağ oranı değeri gir.", "Enter a valid body fat % value."));
      return;
    }

    setIsSubmitting(true);
    try {
      await logProgress(token, {
        weight: parsedWeight,
        waist_cm: parsedWaist,
        body_fat_pct: parsedBodyFat,
        workout_completed: false,
      });
      setFormSuccess(t("Kaydedildi!", "Saved!"));
      setWeight("");
      setWaistCm("");
      setBodyFatPct("");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStartEditLog(log: ProgressLog) {
    setEditingLogId(log.id);
    setEditWeight(log.weight != null ? String(log.weight) : "");
    setEditWaistCm(log.waist_cm != null ? String(log.waist_cm) : "");
    setEditBodyFatPct(log.body_fat_pct != null ? String(log.body_fat_pct) : "");
    setEditError(null);
  }

  async function handleSaveLog(logId: number) {
    if (!token) return;
    setEditError(null);

    const parsedWeight = editWeight ? parseLocaleNumber(editWeight) : undefined;
    if (editWeight && Number.isNaN(parsedWeight)) {
      setEditError(t("Geçerli bir kilo değeri gir.", "Enter a valid weight value."));
      return;
    }
    const parsedWaist = editWaistCm ? parseLocaleNumber(editWaistCm) : undefined;
    if (editWaistCm && Number.isNaN(parsedWaist)) {
      setEditError(t("Geçerli bir bel çevresi değeri gir.", "Enter a valid waist value."));
      return;
    }
    const parsedBodyFat = editBodyFatPct ? parseLocaleNumber(editBodyFatPct) : undefined;
    if (editBodyFatPct && Number.isNaN(parsedBodyFat)) {
      setEditError(t("Geçerli bir vücut yağ oranı değeri gir.", "Enter a valid body fat % value."));
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateProgressLog(token, logId, {
        weight: parsedWeight,
        waist_cm: parsedWaist,
        body_fat_pct: parsedBodyFat,
      });
      setEditingLogId(null);
      await loadData();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : t("Güncellenemedi, tekrar dener misin?", "Couldn't update, want to try again?"));
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteLog(logId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      await deleteProgressLog(token, logId);
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  function handleStreakPress() {
    setStreakReplayKey((n) => n + 1);
  }

  const streakDays = summary?.streak_days ?? 0;
  // Koyu modda alt paneller sayfa boyunca yukarıdan aşağıya AKAN bir renk
  // rampası alıyor (bkz. progress-cards.tsx::stackTone) - her panelin dilimi
  // sayfadaki SIRASINA göre. Paneller: form, geçmiş, vücut trendi, aylar arası.
  const panelTotal = 4;
  const tones = {
    form: stackTone(0, panelTotal),
    history: stackTone(1, panelTotal),
    body: stackTone(2, panelTotal),
    trend: stackTone(3, panelTotal),
  };
  // "Antrenman Türü Dağılımı" (mockup'taki sağ sütun) - backend'in haftalık
  // özetindeki hazır `workout_types` sayacından, çoktan aza sıralı.
  const workoutTypeLines = Object.entries(summary?.workout_types ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => {
      const label = (WORKOUT_TYPE_LABELS[language] as Record<string, string>)[type] ?? type;
      return `${label}: ${count}`;
    });
  const currentWeight = currentWeightOf(logs);
  // Sadece kilo/bel/yağ oranından en az biri girilmiş kayıtlar - sohbetten
  // gelen SADECE antrenman-işaretli satırlar (weight/waist/fat hepsi null)
  // burada gösterilmiyor, o veri zaten Antrenman sekmesinde kendi başına var.
  // Artık `historyItems`'tan türetiliyor (grafiklerin kaynağı `logs`'tan
  // BAĞIMSIZ) - zaten en-yeni-önce sırada, reverse() gerekmiyor.
  // Bu filtre artık SADECE savunma katmanı - asıl filtreleme backend'e
  // taşındı (`getProgressLogs(..., measurementsOnly=true)`, bkz.
  // loadHistoryPage) çünkü SADECE frontend'de filtrelemek "limit'in
  // İÇİNDEKİ ham kayıtların çoğu antrenman-işaretliyse gösterilen sayı
  // limit'ten az çıkar" tutarsızlığına yol açıyordu (2026-08-14, kullanıcı
  // canlı telefon testinde yakaladı: "1 kayıt var" görünüp "Daha Fazla
  // Göster"e basınca birden 5 kayıt gelmesi).
  const measurementLogs = historyItems.filter(
    (log) => log.weight !== null || log.waist_cm !== null || log.body_fat_pct !== null
  );

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t("İlerleme", "Progress")}</Text>

          {loadError ? <ErrorBanner message={loadError} /> : null}

          {/* İlerleme tasarımı (2026-09-19, arkadaşın mockup'ı): kutular artık
              `ProgressTile` (bkz. progress-cards.tsx) - Seri de AYNI kabukta,
              içeriği (sayaç+nokta dizisi) `value`/`valueAccessory` ile
              veriliyor. Izgara mantığı (2026-08-22 gerçek-cihaz bulgusu:
              İKİ AÇIK satır, her kutu `flexBasis:0/flexGrow:1/minWidth:0`
              ile KESİN 50/50) AYNEN korundu - kutuların iç yerleşimi
              değişti, dış boyutlandırma değişmedi. Seri SIFIR olsa bile HER
              ZAMAN görünüyor/dokunulabilir (2026-08-19 kullanıcı bulgusu). */}
          {isLoading ? (
            <View style={s.statGridRows}>
              <View style={s.statGridRow}>
                <View style={s.statTileEqual}>
                  <Skeleton height={124} />
                </View>
                <View style={s.statTileEqual}>
                  <Skeleton height={124} />
                </View>
              </View>
              <View style={s.statGridRow}>
                <View style={s.statTileEqual}>
                  <Skeleton height={124} />
                </View>
                <View style={s.statTileEqual}>
                  <Skeleton height={124} />
                </View>
              </View>
            </View>
          ) : (
            <Reveal style={s.statGridRows}>
              <View style={s.statGridRow}>
                <ProgressTile
                  index={0}
                  icon={(color) => <PersonStanding size={15} color={color} />}
                  label={t("Güncel Kilo", "Current Weight")}
                  value={summary?.weight_end != null ? `${summary.weight_end} kg` : "—"}
                  hint={weightHint(summary, language)}
                  onPress={tapLight}
                  containerStyle={s.statTileEqual}
                />
                <ProgressTile
                  index={1}
                  icon={(color) => <Dumbbell size={15} color={color} />}
                  label={t("Bu Hafta Antrenman", "Workouts This Week")}
                  value={String(summary?.workout_count ?? 0)}
                  onPress={tapLight}
                  containerStyle={s.statTileEqual}
                />
              </View>
              <View style={s.statGridRow}>
                <ProgressTile
                  index={2}
                  icon={(color) => <CalendarDays size={15} color={color} />}
                  label={t("Bu Hafta Kayıt", "Entries This Week")}
                  value={String(summary?.log_count ?? 0)}
                  onPress={tapLight}
                  containerStyle={s.statTileEqual}
                />
                <ProgressTile
                  index={3}
                  icon={(color) => <Flame size={15} color={streakDays > 0 && !isDark ? c.accent : color} />}
                  label={t("Seri", "Streak")}
                  value={
                    <AnimatedStreakCount
                      count={streakDays}
                      replayKey={streakReplayKey}
                      style={[s.streakValue, { color: isDark ? "#FFFFFF" : streakDays > 0 ? c.accent : c.text }]}
                    />
                  }
                  valueAccessory={
                    <PulseStreak
                      count={streakDays}
                      max={5}
                      replayKey={streakReplayKey}
                      activeColor={isDark ? "#FFFFFF" : c.accent}
                      inactiveColor={isDark ? "rgba(255,255,255,0.35)" : "#E4E4E4"}
                    />
                  }
                  hint={streakDays > 0 ? t("gün üst üste", "days in a row") : t("henüz seri yok", "no streak yet")}
                  onPress={() => {
                    tapLight();
                    handleStreakPress();
                  }}
                  containerStyle={s.statTileEqual}
                />
              </View>
            </Reveal>
          )}

          {!isLoading && summary ? (
            summary.log_count > 0 ? (
              <ProgressInsight
                title={t("Bu Haftaki İçgörün", "Your Insight This Week")}
                message={workoutTypeLines.length > 0 ? withoutWorkoutTypeSentence(summary.summary_text) : summary.summary_text}
                aside={
                  workoutTypeLines.length > 0
                    ? { title: t("Antrenman Türü Dağılımı:", "Workout Type Split:"), lines: workoutTypeLines }
                    : undefined
                }
              />
            ) : (
              <InfoBanner
                message={t(
                  "Henüz bu hafta bir kayıt yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin.",
                  "No entry logged this week yet. You can add your first entry using the form below."
                )}
              />
            )
          ) : null}

          {!isLoading && profile?.target_weight_kg && currentWeight !== null ? (
            <Reveal delay={60}>
              <WeightGoalCard
                icon={(color) => <Dumbbell size={15} color={color} />}
                goalLabel={t("Kilo Hedefi", "Weight Goal")}
                goalValue={`${profile.target_weight_kg} kg`}
                currentLabel={t("Güncel", "Current")}
                currentValue={`${currentWeight} kg`}
                remainingText={weightGoalRemainingText(currentWeight, profile.target_weight_kg, language)}
              />
            </Reveal>
          ) : null}

          {/* Sadece anlamlı bir sapma tespit edilirse görünür (bkz.
              get_body_composition_insight) - "her açılışta bir şeyler
              söyleme" yorgunluğu yaratmamak için veri desteklemedikçe hiç
              render edilmez (2026-08-11, kullanıcı isteği). */}
          {!isLoading && bodyCompositionInsight ? (
            <ProgressInsight
              title={t("Vücut Kompozisyonu İçgörün", "Your Body Composition Insight")}
              message={bodyCompositionInsight}
            />
          ) : null}

          <Reveal delay={60}>
          <ProgressFormCard {...tones.form}>
            <Text style={s.formTitle}>{t("Kilo Kaydet", "Log Weight")}</Text>
            {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
            {formError ? <ErrorBanner message={formError} /> : null}

            {/* Mockup yerleşimi: üst satırda Kilo | Vücut Yağ, altta Bel
                Çevresi. Alanların anlamı/sırası değişmedi, sadece dizilim. */}
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <FormLabel>{t("Kilo (kg)", "Weight (kg)")}</FormLabel>
                <FormInput
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="numeric"
                  placeholder={t("ör. 78.5", "e.g. 78.5")}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormLabel>{t("Vücut Yağ (%)", "Body Fat (%)")}</FormLabel>
                <FormInput
                  value={bodyFatPct}
                  onChangeText={setBodyFatPct}
                  keyboardType="numeric"
                  placeholder={t("opsiyonel", "optional")}
                />
              </View>
            </View>

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <FormLabel>{t("Bel Çevresi (cm)", "Waist (cm)")}</FormLabel>
                <FormInput
                  value={waistCm}
                  onChangeText={setWaistCm}
                  keyboardType="numeric"
                  placeholder={t("opsiyonel", "optional")}
                />
              </View>
              <View style={{ flex: 1 }} />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={s.hintText}>
                {t(
                  "Bel çevresi: mezuranın nasıl tutulduğuna, gün içindeki saate ve şişkinlik/sıvı durumuna göre değişkenlik gösterebilir.",
                  "Waist: can vary based on how the tape is held, the time of day, and bloating/fluid retention."
                )}
              </Text>
              <Text style={s.hintText}>
                {t(
                  "Vücut yağ oranı: özellikle ev tipi ölçüm cihazları (BIA'lı tartılar) hidrasyon durumuna oldukça duyarlıdır, günden güne birkaç puan oynayabilir.",
                  "Body fat %: home devices (BIA-based scales) in particular are quite sensitive to hydration status and can shift by a few points day to day."
                )}
              </Text>
            </View>

            <PrimaryButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
              {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
            </PrimaryButton>
          </ProgressFormCard>
          </Reveal>

          {/* Tasarım turu (2026-09-19, 2. tur): alt bölüm de üstteki kart
              diline geçti - sıcak koyu kahve/beyaz paneller (bkz.
              `ProgressSectionCard`), turuncu-ailesi grafik renkleri, grafik
              başlarında en güncel değer + fark. Geçmiş satırlarında değerler
              "85 kg, 105 cm, %17.5" düz metni yerine etiketli mini sütunlar. */}
          <Reveal delay={120}>
          <ProgressSectionCard title={t("Geçmiş Kayıtlar", "History")} {...tones.history}>
            {historyError ? <ErrorBanner message={historyError} /> : null}
            {editError ? <ErrorBanner message={editError} /> : null}
            {isLoading ? (
              <Skeleton height={100} />
            ) : measurementLogs.length === 0 ? (
              <EmptyState
                icon={<Scale size={28} color={c.muted} />}
                message={t(
                  "Henüz bir kilo/bel/yağ oranı kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.",
                  "No weight/waist/body fat entry yet. You can add your first entry using the form above."
                )}
              />
            ) : (
              <View style={{ gap: 14 }}>
                {groupEntriesByDate(measurementLogs, (log) => log.log_date, language).map((group) => (
                  <View key={group.label} style={{ gap: 6 }}>
                    <Text style={s.groupLabel}>{group.label}</Text>
                    {group.items.map((log) =>
                      editingLogId === log.id ? (
                        <View key={log.id} style={s.entryRow}>
                          <View style={s.entryEditRow}>
                            <FormInput
                              value={editWeight}
                              onChangeText={setEditWeight}
                              keyboardType="numeric"
                              placeholder={t("kg", "kg")}
                              style={{ width: 64 }}
                            />
                            <FormInput
                              value={editWaistCm}
                              onChangeText={setEditWaistCm}
                              keyboardType="numeric"
                              placeholder={t("cm", "cm")}
                              style={{ width: 64 }}
                            />
                            <FormInput
                              value={editBodyFatPct}
                              onChangeText={setEditBodyFatPct}
                              keyboardType="numeric"
                              placeholder="%"
                              style={{ width: 56 }}
                            />
                            <Pressable onPress={() => handleSaveLog(log.id)} hitSlop={8} disabled={isSavingEdit}>
                              <Check size={16} color={c.success} />
                            </Pressable>
                            <Pressable onPress={() => setEditingLogId(null)} hitSlop={8}>
                              <X size={16} color={c.error} />
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        // Sola kaydır = sil, sağa kaydır = düzenle (kalem/çöp
                        // ikonları da duruyor - ikisi de aynı işi yapıyor).
                        <SwipeableRow
                          key={log.id}
                          style={s.entryRow}
                          onDelete={() => handleDeleteLog(log.id)}
                          onEdit={() => handleStartEditLog(log)}
                        >
                          <View style={s.entryMetrics}>
                            {log.weight != null ? (
                              <View style={s.entryMetric}>
                                <Text style={s.entryValue}>{log.weight} kg</Text>
                                <Text style={s.entryCaption}>{t("Kilo", "Weight")}</Text>
                              </View>
                            ) : null}
                            {log.waist_cm != null ? (
                              <View style={s.entryMetric}>
                                <Text style={s.entryValue}>{log.waist_cm} cm</Text>
                                <Text style={s.entryCaption}>{t("Bel", "Waist")}</Text>
                              </View>
                            ) : null}
                            {log.body_fat_pct != null ? (
                              <View style={s.entryMetric}>
                                <Text style={s.entryValue}>%{log.body_fat_pct}</Text>
                                <Text style={s.entryCaption}>{t("Yağ", "Fat")}</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={s.iconRow}>
                            <Pressable onPress={() => handleStartEditLog(log)} hitSlop={8}>
                              <Pencil size={15} color={panelMuted} />
                            </Pressable>
                            <Pressable onPress={() => handleDeleteLog(log.id)} hitSlop={8}>
                              <Trash2 size={15} color={panelMuted} />
                            </Pressable>
                          </View>
                        </SwipeableRow>
                      )
                    )}
                  </View>
                ))}
                {hasMoreHistory ? (
                  <ProgressTextButton onPress={handleLoadMoreHistory} disabled={isLoadingMoreHistory} loading={isLoadingMoreHistory}>
                    {t("Daha Fazla Göster", "Show More")}
                  </ProgressTextButton>
                ) : null}
              </View>
            )}
          </ProgressSectionCard>
          </Reveal>

          {/* Grafik panelleri (2026-09-19, 3. tur): Kilo/Bel/Yağ artık TEK
              sekmeli panel, hepsi kendi SVG grafik çekirdeğiyle (bkz.
              charts/svg-charts.tsx) - tarihe ölçekli eksen, kilo hedef
              çizgisi, dokunarak seçim. gifted-charts sadece diğer
              sekmelerde kaldı. */}
          <Reveal delay={180}>
          <ProgressSectionCard title={t("Vücut Trendi", "Body Trends")} {...tones.body}>
            {isLoading ? <Skeleton height={320} /> : <BodyMetricsPanel logs={logs} goalWeight={profile?.target_weight_kg} />}
          </ProgressSectionCard>
          </Reveal>

          <Reveal delay={240}>
          <ProgressSectionCard
            title={t("Aylar Arası Trend", "Trend Over Months")}
            {...tones.trend}
            subtitle={t(
              "Son 12 haftada ruh hali ve antrenman günlerinin haftalık örüntüsü.",
              "The weekly pattern of mood and workout days over the last 12 weeks."
            )}
          >
            {isLoading ? (
              <Skeleton height={320} />
            ) : (
              <MonthlyTrendPanel
                points={trends?.points ?? []}
                note={
                  <ProgressNote>
                    {correlationInsightText(trends?.mood_workout_correlation ?? null, language)}
                  </ProgressNote>
                }
              />
            )}
          </ProgressSectionCard>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Tasarım turu (2026-09-19): bkz. workouts.tsx'teki AYNI not - yüzen alt
// gezinme pili artık içerik için otomatik yer ayırmıyor.
function makeStyles(c: ThemeColors, insetBottom: number, isDark: boolean) {
  const panelMuted = isDark ? "rgba(255,255,255,0.72)" : c.muted;
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.background,
    },
    container: {
      padding: 16,
      gap: 16,
      paddingBottom: 32 + getFloatingTabBarClearance(insetBottom),
    },
    // Fraunces SADECE büyük punto (bkz. redesign planı) - sayfa başlığı bu
    // kuralın dışında kalıyor (Inter'de kalıyor), sadece StatTile rakamları
    // ve karşılama metni Fraunces kullanıyor.
    // Mockup'ta başlık belirgin biçimde daha büyük ve daha hafif (Medium).
    title: {
      fontSize: 30,
      fontFamily: "Inter_500Medium",
      color: c.text,
      marginBottom: 4,
    },
    formTitle: {
      fontSize: 22,
      fontFamily: "Inter_500Medium",
      color: c.text,
    },
    streakValue: {
      fontSize: 30,
      fontFamily: "Inter_500Medium",
      letterSpacing: -0.5,
    },
    // Kullanıcı bulgusu (2026-08-21, GERÇEK telefonda): `alignItems:
    // "flex-start"` ızgarayı komple bozdu (kutular üst üste bindi). O
    // düzeltildikten sonra 2026-08-22'de İKİNCİ bir gerçek-cihaz bulgusu:
    // satırdaki 2 kutu eşit genişlikte DEĞİLDİ (sağdaki belirgin şekilde
    // daha geniş). Denenen `flexBasis:"48%"` (+/- flexGrow) kombinasyonlarının
    // HİÇBİRİ güvenilir simetrik sonuç vermedi - biri native'de asimetrik,
    // diğeri web'de içeriğe sıkışma bug'ı yarattı (bkz. `statTileEqual`
    // notu). Artık ızgara TEK bir flexWrap konteyner DEĞİL, İKİ AÇIK dikey
    // satır (`statGridRows` içinde `statGridRow`) - her satırda TAM 2 kutu.
    statGridRows: {
      gap: 10,
    },
    statGridRow: {
      flexDirection: "row",
      gap: 10,
    },
    // Bir satırdaki 2 kutuyu KESİN 50/50 böler - `flexBasis:0` (percentage
    // DEĞİL, mutlak sıfır) + `flexGrow:1` ile her iki kutu da SIFIRDAN
    // büyüyüp aynı oranda genişliyor. `minWidth: 0` KRİTİK - onsuz her
    // kutunun örtük bir "min-content" tabanı kalıyor (flexbox varsayılanı),
    // Seri'nin nokta dizisi Kayıt'ın çıplak sayısından biraz daha geniş bir
    // taban istediği için ~30px'lik küçük ama gerçek bir asimetri kalıyordu
    // (canlı testte ölçüldü). `minWidth:0` bu tabanı sıfırlayıp SAF
    // flexGrow oranına (yani tam %50/%50) bırakıyor - içerik gerekirse
    // sarar, kutu asla büyümez.
    statTileEqual: {
      flexBasis: 0,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    row: {
      flexDirection: "row",
      gap: 10,
    },
    hintText: {
      fontSize: 11,
      color: panelMuted,
      lineHeight: 16,
    },
    groupLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: panelMuted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    // Satır zemini: koyuda yarı saydam beyaz (kahve panelin üstünde),
    // açıkta şeftali tonu - üstteki kutuların gölge/şeftali diliyle uyumlu.
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    entryEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
    entryMetrics: { flexDirection: "row", alignItems: "center", gap: 20, flex: 1, flexWrap: "wrap" },
    entryMetric: { gap: 1 },
    entryValue: { fontSize: 15, fontFamily: "Inter_500Medium", color: c.text },
    entryCaption: { fontSize: 10, color: panelMuted },
    iconRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  });
}
