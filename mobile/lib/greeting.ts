import type { PreferredLanguage } from "@/lib/api";

// web/src/lib/greeting.ts'in birebir portu (platforma özel bir şey yok).
export function getTimeGreeting(date: Date = new Date(), language: PreferredLanguage = "tr"): string {
  const hour = date.getHours();
  if (language === "en") {
    if (hour < 6) return "Good night";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

const MOOD_SUBTEXTS: Record<PreferredLanguage, Record<string, string>> = {
  tr: {
    zor: "Bugün zor bir gün gibi görünüyor. İstersen ne olduğunu anlat, birlikte bakalım.",
    dusuk: "Biraz düşük hissediyorsun gibi. Konuşmak da, ilerlemene bakmak da olur.",
    notr: "Koçuna hedeflerini, bir soruyu ya da bugün nasıl geçtiğini anlatarak başlayabilirsin.",
    iyi: "Bugün iyi hissediyorsun, güzel! Hedeflerinden birine göz atalım mı?",
    harika: "Bugün harika hissediyorsun! Bu enerjiyle ne yapmak istersin?",
  },
  en: {
    zor: "Today seems like a tough day. If you'd like, tell me what's going on and we'll look at it together.",
    dusuk: "You seem to be feeling a bit low. We can talk, or take a look at your progress.",
    notr: "You can start by telling your coach about your goals, a question, or how your day is going.",
    iyi: "You're feeling good today, nice! Want to check in on one of your goals?",
    harika: "You're feeling great today! What would you like to do with that energy?",
  },
};

const DEFAULT_SUBTEXT: Record<PreferredLanguage, string> = {
  tr: "Koçuna hedeflerini, bir soruyu ya da bugün nasıl geçtiğini anlatarak başlayabilirsin.",
  en: "You can start by telling your coach about your goals, a question, or how your day is going.",
};

export function getMoodAwareSubtext(moodKey: string | null, language: PreferredLanguage = "tr"): string {
  if (!moodKey) return DEFAULT_SUBTEXT[language];
  return MOOD_SUBTEXTS[language][moodKey] ?? DEFAULT_SUBTEXT[language];
}
