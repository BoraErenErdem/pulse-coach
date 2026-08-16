import type { PreferredLanguage } from "./api";
import { formatDate } from "./format";

// İlerleme/Antrenman/Beslenme/Egzersiz Geçmişi "Geçmiş Kayıtlar"
// listelerinin zamanla çok uzayıp özellikle mobilde görsel olarak
// bunaltıcı olması üzerine eklendi (2026-08-14, kullanıcı isteği) - kayıtlar
// gün başlıklarına ("Bugün"/"Dün"/"12 Ağustos Çarşamba") gruplanır.
// web/src/lib/date-grouping.ts'in mobil portu - aynı mantık, tarih
// formatlaması için mevcut merkezi formatDate() (bkz. mobile/lib/format.ts)
// yeniden kullanılıyor.

export interface DateGroup<T> {
  label: string;
  items: T[];
}

/** İki tarihi "gün" olarak karşılaştırır (saat dilimi kaymalarına karşı
 * new Date(iso) doğrudan farkı almak yerine yerel gün bileşenleri
 * üzerinden). `isoDate` saatsiz ("2026-08-14") kabul edilir. */
function daysBetween(isoDate: string, today: Date): number {
  const d = new Date(`${isoDate}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t.getTime() - d.getTime()) / 86400000);
}

function relativeOrFormattedLabel(isoDate: string, language: PreferredLanguage, today: Date): string {
  const diff = daysBetween(isoDate, today);
  if (diff === 0) return language === "en" ? "Today" : "Bugün";
  if (diff === 1) return language === "en" ? "Yesterday" : "Dün";
  return formatDate(isoDate, language, { day: "2-digit", month: "long", weekday: "long" });
}

/** Bir kayıt listesini, alan çıkarıcı fonksiyonla ISO tarihine göre gün
 * başlıklarına gruplar. `entries` ÖNCEDEN istenen görüntüleme sırasında
 * (en yeni önce) verilmelidir - fonksiyon sıralama YAPMAZ, sadece ardışık
 * aynı-etiketli öğeleri tek geçişte gruplar (sınırdaki gün grupları doğru
 * birleşsin diye, "Daha Fazla Göster" sonrası TÜM liste yeniden
 * gruplanmalı, sadece yeni sayfa değil). */
export function groupEntriesByDate<T>(
  entries: T[],
  getDateField: (item: T) => string,
  language: PreferredLanguage,
  today: Date = new Date()
): DateGroup<T>[] {
  const groups: DateGroup<T>[] = [];
  let currentLabel: string | null = null;
  for (const item of entries) {
    const label = relativeOrFormattedLabel(getDateField(item), language, today);
    if (label !== currentLabel) {
      groups.push({ label, items: [item] });
      currentLabel = label;
    } else {
      groups[groups.length - 1].items.push(item);
    }
  }
  return groups;
}

export interface WeekGroup<T> {
  /** O haftanın Pazartesi'si, ISO tarih ("YYYY-MM-DD"). */
  weekStartIso: string;
  /** Pazartesi'den Pazar'a TAM 7 hücre - veri olmayan gün `null`. */
  days: (T | null)[];
}

function isoWeekStartDate(isoDate: string): Date {
  const d = new Date(`${isoDate}T00:00:00`);
  const day = d.getDay(); // 0=Paz..6=Cmt
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function toIsoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Bir kayıt listesini Pazartesi başlangıçlı ISO haftalara gruplar - Ruh
 * Hali Geçmişi'nin haftalık ızgara görünümü için eklendi (2026-08-18,
 * kullanıcı isteği: 90 günlük düz liste yerine "bir bakışta" haftalık
 * ızgara). Pazartesi başlangıcı backend'in `calculate_weekly_streak()`
 * (ISO hafta bazlı) ile TUTARLI - dile göre değişmiyor, ürünün kendi
 * "hafta" tanımı sabit. En yeni hafta EN BAŞTA döner. */
export function groupEntriesByWeek<T>(entries: T[], getDateField: (item: T) => string): WeekGroup<T>[] {
  const weeks = new Map<string, WeekGroup<T>>();
  for (const item of entries) {
    const isoDate = getDateField(item);
    const weekStartIso = toIsoDateOnly(isoWeekStartDate(isoDate));
    let week = weeks.get(weekStartIso);
    if (!week) {
      week = { weekStartIso, days: [null, null, null, null, null, null, null] };
      weeks.set(weekStartIso, week);
    }
    const dow = new Date(`${isoDate}T00:00:00`).getDay();
    const dayIndex = dow === 0 ? 6 : dow - 1; // Pzt=0 .. Paz=6
    week.days[dayIndex] = item;
  }
  return [...weeks.values()].sort((a, b) => b.weekStartIso.localeCompare(a.weekStartIso));
}
