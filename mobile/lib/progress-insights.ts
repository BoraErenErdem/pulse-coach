// İlerleme sekmesinin içgörü metinleri - saf fonksiyonlar (2026-09-26,
// app/(tabs)/progress.tsx'ten taşındı - mantık aynı).
import { type PreferredLanguage, type ProgressLog, type WeeklySummary } from "@/lib/api";
export function correlationInsightText(correlation: number | null, language: PreferredLanguage): string {
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

export function weightHint(summary: WeeklySummary | null, language: PreferredLanguage): string | undefined {
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
export function withoutWorkoutTypeSentence(text: string): string {
  return text.replace(/\s*(?:Antrenman türü dağılımı|Workout type breakdown):[^.]*\./i, "");
}

// Kullanıcı bulgusu (2026-09-22, İKİ tur): "Bu Haftaki İçgörün" kartı
// Antrenman sekmesindeki "Bu Haftaki Antrenman Özetin" kadar anlaşılır
// değildi - backend'in `summary_text`'i (agent/sohbet bağlamında da
// kullanıldığı için DOKUNULMADI) antrenman/kilo/seri gibi FARKLI konuları
// tek bir düz paragrafta birleştiriyordu. İLK düzeltme (başlık+madde işaretli
// satırlar) YETERSİZ kaldı - kullanıcı cihazda ekran görüntüsü paylaştı,
// kart HÂLÂ "dağınık/düzensiz" duruyordu. Kök neden asıl İKİ SÜTUNLU
// yerleşimdi: sol sütun (metin) ile sağ sütun (`aside` - antrenman türü
// dağılımı) farklı satır ritimlerinde, hizasız duruyordu - Antrenman'ın
// kartı ise HİÇ aside kullanmıyor, TEK sütun. Artık `aside` TAMAMEN
// kaldırıldı, tür dağılımı da AYNI tek sütunlu madde işaretli listeye kendi
// satırı olarak katılıyor (`workoutTypeLines`'ın zaten hazır, düzgün
// etiketlenmiş/sıralı biçimi kullanılıyor - backend'in ham cümlesi değil).
export function formatInsightMessage(text: string): string {
  const rawSentences = text
    .split(". ")
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (rawSentences.length <= 1) return text;
  const sentences = rawSentences.map((sentence, i) => (i < rawSentences.length - 1 ? `${sentence}.` : sentence));
  const [headline, ...rest] = sentences;
  return [headline, ...rest.map((sentence) => `•  ${sentence}`)].join("\n");
}

export function buildWeeklyInsightMessage(
  summaryText: string,
  workoutTypeLines: string[],
  language: PreferredLanguage
): string {
  const stripped = workoutTypeLines.length > 0 ? withoutWorkoutTypeSentence(summaryText) : summaryText;
  const base = formatInsightMessage(stripped);
  if (workoutTypeLines.length === 0) return base;
  const label = language === "en" ? "Workout split" : "Antrenman türü";
  return `${base}\n•  ${label}: ${workoutTypeLines.join(", ")}`;
}

export function lastValueOf(logs: ProgressLog[], field: "waist_cm" | "body_fat_pct"): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i][field] !== null) return logs[i][field];
  }
  return null;
}

export function currentWeightOf(logs: ProgressLog[]): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].weight !== null) return logs[i].weight;
  }
  return null;
}

// Tasarım turu (2026-09-19): "Kilo Hedefi" kartının alt notu - mockup'taki
// bağımsız cümle ("3.0 kg alınması gerekiyor"), eski satır-içi "(...)"/"—"
// biçimi kartın yeni yerleşiminde yetim kalırdı.
export function weightGoalRemainingText(current: number, target: number, language: PreferredLanguage): string {
  const diff = current - target;
  if (Math.abs(diff) < 0.1) return language === "en" ? "You've reached your goal!" : "Hedefine ulaştın!";
  if (diff > 0) {
    return language === "en" ? `${diff.toFixed(1)} kg to lose` : `${diff.toFixed(1)} kg verilmesi gerekiyor`;
  }
  return language === "en" ? `${Math.abs(diff).toFixed(1)} kg to gain` : `${Math.abs(diff).toFixed(1)} kg alınması gerekiyor`;
}
