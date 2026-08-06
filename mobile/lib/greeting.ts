// web/src/lib/greeting.ts'in birebir portu (platforma özel bir şey yok).
export function getTimeGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

const MOOD_SUBTEXTS: Record<string, string> = {
  zor: "Bugün zor bir gün gibi görünüyor. İstersen ne olduğunu anlat, birlikte bakalım.",
  dusuk: "Biraz düşük hissediyorsun gibi. Konuşmak da, ilerlemene bakmak da olur.",
  notr: "Koçuna hedeflerini, bir soruyu ya da bugün nasıl geçtiğini anlatarak başlayabilirsin.",
  iyi: "Bugün iyi hissediyorsun, güzel! Hedeflerinden birine göz atalım mı?",
  harika: "Bugün harika hissediyorsun! Bu enerjiyle ne yapmak istersin?",
};

const DEFAULT_SUBTEXT =
  "Koçuna hedeflerini, bir soruyu ya da bugün nasıl geçtiğini anlatarak başlayabilirsin.";

export function getMoodAwareSubtext(moodKey: string | null): string {
  if (!moodKey) return DEFAULT_SUBTEXT;
  return MOOD_SUBTEXTS[moodKey] ?? DEFAULT_SUBTEXT;
}
