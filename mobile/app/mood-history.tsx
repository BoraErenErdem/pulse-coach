import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { HeartPulse } from "lucide-react-native";
import { ApiError, getMoodHistory, getMoodInsight, type MoodInsight, type MoodKey, type MoodLog } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { groupEntriesByWeek } from "@/lib/date-grouping";
import {
  Card,
  DetailScreen,
  EmptyState,
  ErrorBanner,
  InsightCard,
  InsightCardSkeleton,
  MOOD_KEYS,
  MOOD_META,
  RevealOnMount,
  Skeleton,
  type ThemeColors,
  useThemeColors,
} from "@/components/ui";
import { MoodTrendChart } from "@/components/charts/mood-trend-chart";
import { MoodPicker } from "@/components/mood-picker";

// web/src/app/(app)/mood/page.tsx'in mobil portu - Faz M5. Mod SEÇİMİ ÖNCEDEN
// SADECE Sohbet sekmesinde (MoodPicker, Faz M2) yapılıyordu, bu ekran salt
// geçmiş/trend gösteriyordu - kullanıcı bulgusu (2026-08-19): "Ruh Hali
// sekmesinden ruh halini seçemiyoruz" - beklenmedik bir asimetriydi, aynı
// paylaşımlı `MoodPicker` bileşeni burada da eklendi (bkz. aşağı).
// Redesign (Faz M2b, 2026-08-15): statik `colors` yerine `useThemeColors()`.
// Bu ekranda silme/düzenleme YOK (mood salt-okunur geçmiş) - BottomSheet/
// SwipeableRow'a gerek yok, sadece tema düzeltmesi.
// Haftalık ızgara (2026-08-16, kullanıcı isteği - daha önce değerlendirilip
// ertelenmiş bir öneri, şimdi uygulandı, bkz. 616df14): düz "Geçmiş
// Kayıtlar" listesi (90 gün, hiç sayfalanmıyordu - bu ekran 4 kardeş
// ekrandan [İlerleme/Antrenman/Beslenme/Egzersiz Geçmişi] farklı olarak
// kademeli yükleme TURUNU hiç görmemişti) yerine Pzt-Paz 7 hücrelik
// haftalık satırlar geldi - hem "bir bakışta" daha anlaşılır hem de 90 günü
// ~13 kompakt satıra indirip "liste çok uzun" sorununu kendiliğinden
// çözüyor, ayrıca sayfalama GEREKMİYOR.
// İçgörü kartı (2026-08-16, kullanıcı isteği): kural-tabanlı istatistik +
// LLM ile yumuşatma (GET /mood/insight, bkz. backend d9b6486) - Trend
// kartıyla Haftalık Görünüm kartı arasında, exercise-history.tsx'teki
// "Koçunun Yorumu" ile AYNI ayrı/gecikmeli yükleme deseni (LLM birkaç
// saniye sürebiliyor, grafik/ızgara bunu beklemeden anında görünür).
const DAY_LABELS: Record<"tr" | "en", string[]> = {
  tr: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isFutureDate(isoDate: string): boolean {
  const d = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return d.getTime() > t.getTime();
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** İki hex rengin (#RRGGBB) arasında `t` oranında ara değer hesaplar - `t`
 * [0,1] aralığının DIŞINA da çıkabilir (ekstrapolasyon): `t<0` `a`'nın
 * gerisine, `t>1` `b`'nin ÖTESİNE gider (aynı doğru üzerinde, `moodTintColor`
 * bunu Harika için kullanıyor - aşağıdaki not). Kanallar 0-255'e KENETLENİR
 * (`clampByte`) - ekstrapolasyon negatif ya da 255'i aşan bir değer üretirse. */
function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v));
}
function interpolateHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const toHex = (v: number) => Math.round(clampByte(v)).toString(16).padStart(2, "0");
  return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`;
}

// Izgara polirajı - 12. tur (kullanıcı isteği, 2026-08-19: "İyi yine Nötr'den
// sönük - bu renkleri baştan düzgünce ayarla"). 10-11. turlar `interpolateHex`
// (Zor/Düşük/Nötr için) ile AYRI, İLİŞKİSİZ bir `darkenHex` işlemini
// (İyi/Harika için) YAN YANA kullanıyordu - iki farklı formülün sonuçları
// birbirine göre KÖR TAHMİNLE sıralanıyordu, bu yüzden her düzeltme bir
// ilişkiyi onarırken başka birini bozdu (İyi↔Harika sırası, sonra İyi↔Nötr
// sırası). KÖKTEN çözüm: artık TEK bir formül, TEK bir doğru üzerinde 5 nokta
// - `interpolateHex(c.surface, c.success, t)`, t SIRAYLA 0.2/0.4/0.6/0.85/1.25
// (Harika için t>1, yani `success`'ın ÖTESİNE - "orman yeşili" derinliği
// buradan geliyor, `darkenHex` gibi AYRI bir işlem DEĞİL). Aynı doğru + kesin
// ARTAN t değerleri ⇒ 5 nokta MATEMATİKSEL OLARAK garanti sıralı (ışıktan
// koyuya AÇIK temada, koyudan parlağa KOYU temada - `c.surface` her temada
// zaten "en az renkli" nokta olduğu için yön otomatik doğru çıkıyor, ayrı
// tema mantığı YAZMADIK). Değerler hesaplanıp doğrulandı: açık temada Zor
// #d8e6d7 (soluk) → Harika #0e7436 (GitHub'ın kendi en koyu yeşiline çok
// yakın); koyu temada Zor #263f37 (loş) → Harika #66d790 (canlı/parlak).
// Emoji HÂLÂ birincil taşıyıcı (a11y: renk TEK BAŞINA anlam taşımıyor).
function moodTintColor(c: ThemeColors, key: MoodKey): string {
  const STEP: Record<MoodKey, number> = { zor: 0.2, dusuk: 0.4, notr: 0.6, iyi: 0.85, harika: 1.25 };
  return interpolateHex(c.surface, c.success, STEP[key]);
}

export default function MoodHistoryScreen() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [history, setHistory] = useState<MoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [insight, setInsight] = useState<MoodInsight | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  const MOOD_OPTIONS = MOOD_KEYS.reduce(
    (acc, key) => {
      acc[key] = { emoji: MOOD_META[key].emoji, label: t(MOOD_META[key].tr, MOOD_META[key].en) };
      return acc;
    },
    {} as Record<MoodKey, { emoji: string; label: string }>
  );

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const data = await getMoodHistory(token, 90);
      setHistory(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  // Yeterli sinyal yoksa backend hiç LLM çağırmadan hızlıca message: null
  // döner (bkz. GET /mood/insight), bu yüzden veri az/yokken de her focus'ta
  // çağırmak güvenli/ucuz.
  const loadInsight = useCallback(async () => {
    if (!token) return;
    setIsInsightLoading(true);
    try {
      const result = await getMoodInsight(token);
      setInsight(result);
    } catch {
      setInsight(null);
    } finally {
      setIsInsightLoading(false);
    }
  }, [token]);

  const weeks = useMemo(() => groupEntriesByWeek(history, (entry) => entry.log_date), [history]);
  const today = useMemo(() => todayIso(), []);

  // MoodPicker kendi API çağrısını (setTodayMood/deleteTodayMood) kendi
  // yapıyor - `onMoodChange` bu tamamlanmadan ÖNCE, iyimser/optimistic UI
  // için hemen tetikleniyor (bkz. mood-picker.tsx::handleSelect). O yüzden
  // burada loadData() ile SUNUCUDAN yeniden çekmek yarış durumu yaratırdı
  // (henüz yazılmamış eski veriyi geri getirebilirdi) - bunun yerine
  // `history`'yi YEREL olarak, bugünün kaydını değiştirerek güncelliyoruz,
  // aynı MoodPicker'ın kendi iyimser deseni gibi. İçgörü kartı BİLEREK
  // yeniden çekilmiyor - tek günlük bir değişiklik haftalar süren istatistiği
  // nadiren anlık değiştirir, sonraki sekme girişinde zaten tazeleniyor.
  function handleMoodChange(mood: MoodKey | null) {
    setHistory((prev) => {
      const withoutToday = prev.filter((entry) => entry.log_date !== today);
      return mood ? [...withoutToday, { mood_key: mood, log_date: today }] : withoutToday;
    });
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
      loadInsight();
    }, [loadData, loadInsight])
  );

  return (
    <DetailScreen title={t("Ruh Hali", "Mood")}>
      <ScrollView contentContainerStyle={s.container}>
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {/* Sohbet sekmesindeki MoodPicker ile AYNI bileşen - seçim orada da
            burada da mood_logs'a kalıcı yazılıyor, kopya bir mantık yok.
            onMoodChange'in ne yaptığı için handleMoodChange tanımındaki
            nota bak (yeniden ÇEKMEK yerine yerel/iyimser güncelleme). */}
        <RevealOnMount delay={200}>
        <Card>
          <MoodPicker onMoodChange={handleMoodChange} />
        </Card>
        </RevealOnMount>

        <RevealOnMount delay={260}>
        <Card>
          <Text style={s.cardTitle}>{t("Son 90 Gün Trend", "Last 90 Days Trend")}</Text>
          {isLoading ? <Skeleton height={220} /> : <MoodTrendChart history={history} />}
        </Card>
        </RevealOnMount>

        {/* Kullanıcı bulgusu (2026-08-23, mobil canlı test): "insufficient_data"
            için (ör. az/eski kayıt) LLM hiç çağrılmıyor - bu yüzden
            getMoodInsight() genelde getMoodHistory()'den ÖNCE döner. Sadece
            `isInsightLoading`'e bakınca, insight erken bittiğinde ama
            `history` HÂLÂ [] iken alttaki `history.length > 0` koşulu yanlışlıkla
            false oluyordu - iskelet önce görünüp SONRA hiçbir şeye (ne karta ne
            yer tutucuya) düşüyordu. `isLoading`'i de bekleterek `history`nin
            KESİN son haline ulaşmasını garantiliyoruz. */}
        {isInsightLoading || isLoading ? (
          <InsightCardSkeleton title={t("Ruh Hali Gözlemi", "Mood Observation")} />
        ) : insight?.status === "ready" && insight.message ? (
          <InsightCard title={t("Ruh Hali Gözlemi", "Mood Observation")} message={insight.message} />
        ) : insight?.status === "insufficient_data" && history.length > 0 ? (
          // Zaten kayıt var ama içgörü için henüz yetersiz - bunu Haftalık
          // Görünüm'ün "hiç kayıt yok" EmptyState'iyle KARIŞTIRMA (o zaten
          // history.length===0 iken görünüyor, burası history.length>0 ama
          // sinyal=insufficient iken).
          <RevealOnMount delay={200} style={s.insightPlaceholder}>
            <HeartPulse size={16} color={c.muted} />
            <Text style={s.insightPlaceholderText}>
              {t(
                "Henüz yeterli veri yok - ruh halini bir-iki hafta daha düzenli kaydettikçe burada kişisel bir gözlem göreceksin.",
                "Not enough data yet - keep logging your mood regularly for a week or two and a personal observation will appear here."
              )}
            </Text>
          </RevealOnMount>
        ) : insight?.status === "no_signal" ? (
          // Yeterli veri var AMA dikkat çekici bir eğilim/örüntü yok -
          // kullanıcı bulgusu (2026-08-23): önceden bu durumda kart
          // TAMAMEN gizleniyordu, bu "uygulama çalışmıyor" hissi
          // veriyordu (özellikle düzenli kayıt tutan ama dengeli bir ruh
          // haline sahip kullanıcılar için). Kural-tabanlı, SABİT bir
          // metin - LLM çağrılmıyor (no_signal'da LLM'e hiç gidilmemesi
          // BİLEREK korundu, bkz. routers/mood.py), ama kullanıcı en
          // azından verisinin görüldüğünü anlıyor.
          <InsightCard
            title={t("Ruh Hali Gözlemi", "Mood Observation")}
            message={t(
              "Şu an belirgin bir eğilim ya da örüntü yok - ruh halin dengeli görünüyor.",
              "No clear trend or pattern right now - your mood looks steady."
            )}
          />
        ) : null}

        <RevealOnMount delay={320}>
        <Card>
          <Text style={s.cardTitle}>{t("Haftalık Görünüm", "Weekly View")}</Text>
          {isLoading ? (
            <Skeleton height={140} />
          ) : history.length === 0 ? (
            <EmptyState
              icon={<HeartPulse size={28} color={c.muted} />}
              message={t(
                "Henüz ruh hali kaydı yok. Sohbet sekmesindeki mod seçiciyi kullandıkça burada listelenecek.",
                "No mood logged yet. Entries will appear here as you use the mood picker on the chat tab."
              )}
            />
          ) : (
            <View style={{ gap: 10 }}>
              <View style={s.dayLabelRow}>
                {DAY_LABELS[language].map((label) => (
                  <Text key={label} style={s.dayLabel}>
                    {label}
                  </Text>
                ))}
              </View>
              {weeks.map((week) => (
                <View key={week.weekStartIso} style={s.weekRow}>
                  {week.days.map((entry, i) => {
                    const dateIso = addDaysIso(week.weekStartIso, i);
                    const option = entry ? MOOD_OPTIONS[entry.mood_key] : null;
                    const future = isFutureDate(dateIso);
                    const isToday = dateIso === today;
                    return (
                      <View
                        key={dateIso}
                        style={[
                          s.dayCell,
                          entry ? { backgroundColor: moodTintColor(c, entry.mood_key) } : future ? s.dayCellFuture : s.dayCellEmpty,
                          isToday && s.dayCellToday,
                        ]}
                        accessibilityLabel={
                          formatDate(dateIso, language, { day: "2-digit", month: "long" }) +
                          (option ? `: ${option.label}` : "") +
                          (isToday ? ` (${t("bugün", "today")})` : "")
                        }
                      >
                        {option ? (
                          <Text style={s.dayEmoji}>{option.emoji}</Text>
                        ) : (
                          <Text style={[s.dayNumber, future && s.dayNumberFuture, isToday && s.dayNumberToday]}>
                            {new Date(`${dateIso}T00:00:00`).getDate()}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={s.legendRow}>
                <View style={s.legendScale}>
                  {MOOD_KEYS.map((key) => (
                    <View key={key} style={[s.legendSwatch, { backgroundColor: moodTintColor(c, key) }]} />
                  ))}
                </View>
                <Text style={s.legendText}>
                  {t("Ton, Zor'dan Harika'ya doğru koyulaşır", "Shade deepens from Tough to Great")}
                </Text>
              </View>
            </View>
          )}
        </Card>
        </RevealOnMount>
      </ScrollView>
    </DetailScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { padding: 16, gap: 16, paddingBottom: 32 },
    cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.text },
    insightPlaceholder: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    insightPlaceholderText: { flex: 1, fontSize: 13, color: c.muted },
    dayLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 6,
    },
    dayLabel: {
      flex: 1,
      textAlign: "center",
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: c.muted,
      textTransform: "uppercase",
    },
    weekRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 6,
    },
    dayCell: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    // Geçmişte kalmış ama loglanmamış gün - hafif bir çerçeveyle "buraya
    // bir kayıt eklenebilirdi" hissi.
    dayCellEmpty: { backgroundColor: c.surfaceMuted, borderWidth: 1, borderColor: c.border },
    // Henüz gelmemiş gün - `insightPlaceholder` ile AYNI kesikli-çerçeve
    // dili (bu dosyada zaten "henüz yok" anlamı için kullanılıyor) - önceden
    // tamamen çerçevesiz/boştu, ızgaranın geri kalanından KOPMUŞ gibi
    // görünüyordu (kullanıcı isteği, 2026-08-19: "sayfaya yakışsın").
    dayCellFuture: { backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: c.border },
    // Bugünün hücresi - Sohbet üst barındaki "Bugün" rozetiyle AYNI accent-
    // çerçeve dili (bkz. index.tsx::s.todayChip) - haftanın neresinde
    // olduğunu bir bakışta gösteriyor, mood dolgusunun/boş-hücrenin ÜSTÜNE
    // eklenen ayrı bir katman (kullanıcı isteği, 2026-08-19).
    dayCellToday: { borderWidth: 2, borderColor: c.accent },
    dayEmoji: { fontSize: 17 },
    dayNumber: { fontSize: 11, color: c.muted },
    dayNumberFuture: { color: c.border },
    dayNumberToday: { color: c.accent, fontFamily: "Inter_700Bold" },
    // Izgaranın altındaki minik açıklama - tonun neyi kodladığını tek
    // cümleyle anlatıyor (kullanıcı isteği, 2026-08-19); emoji zaten
    // BİRİNCİL taşıyıcı olduğu için burası ağır bir renk lejantı değil,
    // moodTintColor sırasını gösteren 5 küçük kare + tek satır metin.
    legendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 2,
    },
    legendScale: {
      flexDirection: "row",
      gap: 3,
    },
    legendSwatch: {
      width: 10,
      height: 10,
      borderRadius: 3,
    },
    legendText: {
      flex: 1,
      fontSize: 11,
      color: c.muted,
    },
  });
}
