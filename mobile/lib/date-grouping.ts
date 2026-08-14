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
