import { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Check, Flame, Pencil, Scale, Trash2, X } from "lucide-react-native";
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
import { parseLocaleNumber } from "@/lib/format";
import {
  AnimatedStreakCount,
  Card,
  EmptyState,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  InsightCard,
  PrimaryButton,
  PulseStreak,
  Reveal,
  SecondaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  type ThemeColors,
  useSeriesColors,
  useThemeColors,
} from "@/components/ui";
import { tapLight } from "@/lib/haptics";
import { BodyFatChart } from "@/components/charts/body-fat-chart";
import { TrendCorrelationChart } from "@/components/charts/trend-correlation-chart";
import { WaistChart } from "@/components/charts/waist-chart";
import { WeightChart } from "@/components/charts/weight-chart";

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

function currentWeightOf(logs: ProgressLog[]): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].weight !== null) return logs[i].weight;
  }
  return null;
}

function weightGoalRemainingText(current: number, target: number, language: PreferredLanguage): string {
  const diff = current - target;
  if (Math.abs(diff) < 0.1) return language === "en" ? "— you've reached your goal!" : "— hedefine ulaştın!";
  if (diff > 0) {
    return language === "en" ? `(you need to lose ${diff.toFixed(1)} kg)` : `(${diff.toFixed(1)} kg vermen gerekiyor)`;
  }
  return language === "en"
    ? `(you need to gain ${Math.abs(diff).toFixed(1)} kg)`
    : `(${Math.abs(diff).toFixed(1)} kg alman gerekiyor)`;
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
  const seriesColors = useSeriesColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  // "Seri" kartına/animasyonlu geri bildirime her dokunuşta artıyor -
  // PulseStreak'in noktalarını VE AnimatedStreakCount'un sayaç+sıçrama
  // animasyonunu YENİDEN oynatmak için (kullanıcı isteği, 2026-08-19:
  // "streak kısmına dokununca daha güzel animasyonla streak belli olsun") -
  // bkz. rhythm-ring.tsx::AnimatedRing'teki AYNI replayKey ilkesi.
  const [streakReplayKey, setStreakReplayKey] = useState(0);
  // Seri kutusu artık istatistik ızgarasının BİR PARÇASI (kullanıcı isteği,
  // 2026-08-21: "streak kısmını bu hafta kayıt tab'ının yanına alsak...
  // görsel bütünlük açısından daha güzel olur") - StatTile'ın generic prop
  // yüzeyini şişirmemek için kendi local bloğu (bkz. altta), ama AYNI
  // s.statTile stilini paylaşıyor. Diğer 3 kutu gibi dokunulunca hafif bir
  // sıçrama oynasın diye kendi shared value'su - StatTile'ın kendi içindeki
  // bounce'tan BAĞIMSIZ (Seri'nin zaten AnimatedStreakCount+PulseStreak
  // üzerinden kendi zengin animasyonu var, StatTile'a taşınmadı).
  const streakTileScale = useSharedValue(1);
  const streakTileBounceStyle = useAnimatedStyle(() => ({ transform: [{ scale: streakTileScale.value }] }));
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
    streakTileScale.value = withSequence(
      withTiming(1.04, { duration: 100, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 140 })
    );
  }

  const streakDays = summary?.streak_days ?? 0;
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t("İlerleme", "Progress")}</Text>

          {loadError ? <ErrorBanner message={loadError} /> : null}

          {/* 2026-08-21 3. tur (kullanıcı isteği: "streak kısmını bu hafta
              kayıt tab'ının yanına alsak... 4'er tane tab olmuş olur,
              görsel bütünlük açısından daha güzel olur"): Seri artık AYRI
              bir hero kart değil, ızgaranın 4. kutusu. Diğer 3 kutu da
              (kullanıcı isteği: "tablara tıklandığında hafif animasyon")
              artık `StatTile`'ın yeni `onPress` prop'uyla dokunulabilir -
              bkz. ui.tsx::StatTile'daki bounce notu.

              2026-08-22 (kullanıcı bulgusu, GERÇEK telefonda): tek bir
              `flexWrap` ızgarasında `flexBasis:"48%"` (+/- flexGrow)
              denemelerinin HİÇBİRİ güvenilir simetrik 2 sütun VERMEDİ -
              flexGrow'lu hali native'de asimetrik genişlik, flexGrow'suz
              percentage-width hali web'de içeriğe sıkışma bug'ı yarattı.
              Artık İKİ AÇIK satır var (`statGridRow`), her birinde TAM 2
              kutu, her kutu KENDİ satırında `containerStyle={flexBasis:0,
              flexGrow:1, flexShrink:1}` ile sarılıyor - bu, içerikten
              tamamen bağımsız KESİN 50/50 bölünme sağlıyor (percentage
              hesaplamasına hiç ihtiyaç yok, tek bir satırda SADECE 2 eşit
              flexGrow'lu kardeş var). Beslenme/Antrenman sekmelerindeki
              StatTile kullanımı (containerStyle GEÇMİYOR) ESKİ flexWrap
              deseniyle DEVAM ediyor - bilerek dokunulmadı. */}
          {isLoading ? (
            <View style={s.statGridRows}>
              <View style={s.statGridRow}>
                <View style={s.statTileEqual}>
                  <Skeleton height={90} />
                </View>
                <View style={s.statTileEqual}>
                  <Skeleton height={90} />
                </View>
              </View>
              <View style={s.statGridRow}>
                <View style={s.statTileEqual}>
                  <Skeleton height={90} />
                </View>
                <View style={s.statTileEqual}>
                  <Skeleton height={90} />
                </View>
              </View>
            </View>
          ) : (
            <Reveal style={s.statGridRows}>
              <View style={s.statGridRow}>
                <StatTile
                  label={t("Güncel Kilo", "Current Weight")}
                  value={summary?.weight_end != null ? `${summary.weight_end} kg` : "—"}
                  hint={weightHint(summary, language)}
                  color={seriesColors.series1}
                  onPress={tapLight}
                  containerStyle={s.statTileEqual}
                />
                <StatTile
                  label={t("Bu Hafta Antrenman", "Workouts This Week")}
                  value={String(summary?.workout_count ?? 0)}
                  color={seriesColors.series2}
                  onPress={tapLight}
                  containerStyle={s.statTileEqual}
                />
              </View>
              <View style={s.statGridRow}>
                <StatTile
                  label={t("Bu Hafta Kayıt", "Entries This Week")}
                  value={String(summary?.log_count ?? 0)}
                  color={seriesColors.series3}
                  onPress={tapLight}
                  containerStyle={s.statTileEqual}
                />
                {/* Seri kutusu - StatTile ÜZERİNDEN DEĞİL (AnimatedStreakCount +
                    kompakt PulseStreak gibi kendine özgü zengin içeriği var,
                    StatTile'ın generic prop yüzeyine sıkıştırmak yerine AYNI
                    s.statTile temel stilini paylaşan kendi bloğu). Streak
                    SIFIR olsa bile HER ZAMAN görünüyor/dokunulabilir - kullanıcı
                    bulgusu (2026-08-19): yeni bir kullanıcının/serisi kırılmış
                    birinin özelliği HİÇ deneyimleyememesi asıl sorundu. */}
                <Pressable
                  onPress={() => {
                    tapLight();
                    handleStreakPress();
                  }}
                  hitSlop={4}
                  style={s.statTileEqual}
                >
                  {({ pressed }) => (
                  <Animated.View
                    entering={FadeIn.duration(300)}
                    style={[s.statTileCard, s.streakTileInner, streakTileBounceStyle, pressed && { opacity: 0.8 }]}
                  >
                    <View style={s.statTileLabelRow}>
                      <Flame size={13} color={streakDays > 0 ? c.accent : c.muted} />
                      <Text style={s.statTileLabel}>{t("Seri", "Streak")}</Text>
                    </View>
                    <AnimatedStreakCount count={streakDays} replayKey={streakReplayKey} style={[s.statTileValue, { color: c.accent }]} />
                    <Text style={s.statTileHint}>
                      {streakDays > 0 ? t("gün üst üste", "days in a row") : t("henüz seri yok", "no streak yet")}
                    </Text>
                    <PulseStreak count={streakDays} max={5} replayKey={streakReplayKey} />
                  </Animated.View>
                  )}
                </Pressable>
              </View>
            </Reveal>
          )}

          {!isLoading && summary ? (
            summary.log_count > 0 ? (
              <InsightCard title={t("Bu Haftaki İçgörün", "Your Insight This Week")} message={summary.summary_text} />
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
            <Card>
              <Text style={s.cardTitle}>{t("Kilo Hedefi", "Weight Goal")}</Text>
              <Text style={s.cardBody}>
                {t("Hedef", "Goal")}: <Text style={s.bold}>{profile.target_weight_kg} kg</Text> — {t("Şu an", "Now")}:{" "}
                <Text style={s.bold}>{currentWeight} kg</Text>{" "}
                {weightGoalRemainingText(currentWeight, profile.target_weight_kg, language)}
              </Text>
            </Card>
            </Reveal>
          ) : null}

          {/* Sadece anlamlı bir sapma tespit edilirse görünür (bkz.
              get_body_composition_insight) - "her açılışta bir şeyler
              söyleme" yorgunluğu yaratmamak için veri desteklemedikçe hiç
              render edilmez (2026-08-11, kullanıcı isteği). */}
          {!isLoading && bodyCompositionInsight ? (
            <InsightCard
              title={t("Vücut Kompozisyonu İçgörün", "Your Body Composition Insight")}
              message={bodyCompositionInsight}
            />
          ) : null}

          <Reveal delay={60}>
          <Card>
            <Text style={s.cardTitle}>{t("Kilo Kaydet", "Log Weight")}</Text>
            {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
            {formError ? <ErrorBanner message={formError} /> : null}

            <View>
              <FormLabel>{t("Kilo (kg)", "Weight (kg)")}</FormLabel>
              <FormInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                placeholder={t("ör. 78.5", "e.g. 78.5")}
                style={{ maxWidth: 140 }}
              />
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
          </Card>
          </Reveal>

          <Reveal delay={120}>
          <Card>
            <Text style={s.cardTitle}>{t("Geçmiş Kayıtlar", "History")}</Text>
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
                    {group.items.map((log) => (
                  <View key={log.id} style={s.entryRow}>
                    {editingLogId === log.id ? (
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
                    ) : (
                      <>
                        <Text style={s.entryText}>
                          {[
                            log.weight != null ? `${log.weight} kg` : null,
                            log.waist_cm != null ? `${log.waist_cm} cm` : null,
                            log.body_fat_pct != null ? `%${log.body_fat_pct}` : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </Text>
                        <View style={s.iconRow}>
                          <Pressable onPress={() => handleStartEditLog(log)} hitSlop={8}>
                            <Pencil size={14} color={c.muted} />
                          </Pressable>
                          <Pressable onPress={() => handleDeleteLog(log.id)} hitSlop={8}>
                            <Trash2 size={14} color={c.muted} />
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                    ))}
                  </View>
                ))}
                {hasMoreHistory ? (
                  <SecondaryButton onPress={handleLoadMoreHistory} disabled={isLoadingMoreHistory} loading={isLoadingMoreHistory}>
                    {t("Daha Fazla Göster", "Show More")}
                  </SecondaryButton>
                ) : null}
              </View>
            )}
          </Card>
          </Reveal>

          <Reveal delay={180}>
          <Card>
            <Text style={s.cardTitle}>{t("Kilo Trendi", "Weight Trend")}</Text>
            {isLoading ? <Skeleton height={200} /> : <WeightChart logs={logs} />}
          </Card>
          </Reveal>

          {!isLoading && logs.some((log) => log.waist_cm !== null) ? (
            <Reveal delay={180}>
            <Card>
              <Text style={s.cardTitle}>{t("Bel Çevresi Trendi", "Waist Trend")}</Text>
              <WaistChart logs={logs} />
            </Card>
            </Reveal>
          ) : null}

          {!isLoading && logs.some((log) => log.body_fat_pct !== null) ? (
            <Reveal delay={180}>
            <Card>
              <Text style={s.cardTitle}>{t("Vücut Yağ Trendi", "Body Fat Trend")}</Text>
              <BodyFatChart logs={logs} />
            </Card>
            </Reveal>
          ) : null}

          <Reveal delay={240}>
          <Card>
            <Text style={s.cardTitle}>{t("Aylar Arası Trend", "Trend Over Months")}</Text>
            <Text style={s.cardSubtitle}>
              {t(
                "Son 12 haftada ruh hali ve antrenman günlerinin haftalık örüntüsü.",
                "The weekly pattern of mood and workout days over the last 12 weeks."
              )}
            </Text>
            {isLoading ? (
              <Skeleton height={280} />
            ) : (
              <>
                <TrendCorrelationChart points={trends?.points ?? []} />
                <Text style={s.cardBody}>
                  {correlationInsightText(trends?.mood_workout_correlation ?? null, language)}
                </Text>
              </>
            )}
          </Card>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.background,
    },
    container: {
      padding: 16,
      gap: 16,
      paddingBottom: 32,
    },
    // Fraunces SADECE büyük punto (bkz. redesign planı) - sayfa başlığı bu
    // kuralın dışında kalıyor (Inter'de kalıyor), sadece StatTile rakamları
    // ve karşılama metni Fraunces kullanıyor.
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: c.text,
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
    // Seri kutusunun İÇ içeriği (bkz. JSX'teki Pressable) - `statTileCard`
    // zaten dış kutunun kendisi (kenarlık/dolgu/boyut), bu SADECE satır
    // arası boşluk için (Pressable'ın tek çocuğu olduğundan `statTileCard.gap`
    // burada hiçbir şeye uygulanmıyor).
    streakTileInner: {
      gap: 4,
    },
    // Seri kutusu StatTile BİLEŞENİ ÜZERİNDEN gitmiyor (bkz. JSX notu) - bu
    // yüzden ui.tsx::StatTile'ın kendi (private) makeStyles'ındaki AYNI
    // görsel değerler burada YİNELENİYOR (ekranlar arası paylaşılan bir
    // StyleSheet objesi yerine, bu dosyanın zaten yaptığı gibi renk
    // token'larından kendi local stilini kurma kuralına uyularak). Boyut
    // (flexBasis/flexGrow) burada YOK - `statTileEqual` (bkz. yukarısı)
    // JSX'te SONRADAN eklenip override ediyor.
    statTileCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 14,
      gap: 4,
    },
    statTileLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    statTileLabel: {
      fontSize: 12,
      color: c.muted,
    },
    statTileValue: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.3,
      color: c.text,
    },
    statTileHint: {
      fontSize: 11,
      color: c.muted,
    },
    cardTitle: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
    cardSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: -10,
    },
    cardBody: {
      fontSize: 13,
      color: c.text,
      lineHeight: 19,
    },
    bold: {
      fontFamily: "Inter_700Bold",
    },
    row: {
      flexDirection: "row",
      gap: 10,
    },
    hintText: {
      fontSize: 11,
      color: c.muted,
      lineHeight: 16,
    },
    groupLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.surfaceMuted,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    entryEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
    entryText: { fontSize: 13, color: c.text, flex: 1 },
    iconRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  });
}
