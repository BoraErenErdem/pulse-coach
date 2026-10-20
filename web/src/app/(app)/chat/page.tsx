"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Dumbbell,
  Lightbulb,
  MessageCircle,
  MoreVertical,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ApiError,
  clearChatHistory,
  dailyTipText,
  deleteChatHistory,
  deleteChatMessage,
  getChatHistory,
  getDailyNutritionSummary,
  getDailyTip,
  getTodayMood,
  getUsage,
  getWeeklySummary,
  getWorkoutSessions,
  streamChatMessage,
  type ConversationMessage,
  type DailyTip,
  type MoodKey,
  type PreferredLanguage,
  type QuotaStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useMediaQuery } from "@/lib/use-media-query";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { displayNameOf, getMoodAwarePlaceholder, getMoodAwareSubtext, getTimeGreeting } from "@/lib/greeting";
import { ErrorBanner, LoadingState, PrimaryButton, SecondaryButton } from "@/components/ui";
import { MessageContent } from "@/components/chat/MessageContent";
import { MoodPicker } from "@/components/MoodPicker";
import { PulseMark } from "@/components/PulseMark";
import { MiniRhythmRing, RhythmRing } from "@/components/RhythmRing";
import { moodPctOf, rhythmEncouragement } from "@/lib/rhythm";

interface DisplayMessage {
  id: string;
  // Sunucudaki satır kimliği - yoksa (akışsız eski yanıt) mesaj silinemez.
  serverId?: number;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function toDisplayMessage(message: ConversationMessage): DisplayMessage {
  return {
    id: String(message.id),
    serverId: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    timestamp: message.timestamp,
  };
}

// Mobil portu (2026-08-24 cila): jenerik User/Bot ikonları yerine gerçek
// kimlik - kullanıcı balonu isminin baş harfini, asistan balonu markanın
// kendi PulseMark motifini gösteriyor (giriş ekranı, sohbet geçmişi
// yüklenirken, InsightCard başlıklarıyla AYNI "AI/koç konuşuyor" dili).
// `initial` boşsa (ör. `user` henüz auth'tan gelmediyse) eski `User`
// ikonuna düşülüyor. `animated` BİLEREK verilmiyor - her mesaj satırında
// sürekli dönen bir animasyon dikkat dağıtıcı olurdu, durağan yeterli.
function Avatar({ role, initial }: { role: "user" | "assistant"; initial?: string }) {
  const isUser = role === "user";
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full lg:h-8 lg:w-8 ${
        isUser
          ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
          : "bg-[var(--tone-accent)]/10 text-[var(--tone-accent)]"
      }`}
    >
      {isUser ? (
        initial ? (
          <span className="text-xs font-bold">{initial}</span>
        ) : (
          <User className="h-4 w-4" />
        )
      ) : (
        <PulseMark size={16} className="text-[var(--tone-accent)]" />
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-zinc-400 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-zinc-400 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-zinc-400 [animation-delay:300ms]" />
    </div>
  );
}

// Kalan günlük mesaj hakkı bu sayıya inince form üstünde gösterilir.
const QUOTA_HINT_THRESHOLD = 10;
// Backend ChatRequest.message sınırı (schemas/conversation.py); sayaç buna yaklaşınca görünür.
const MAX_MESSAGE_LENGTH = 8000;
const LENGTH_HINT_FROM = 7000;
// Mesaj alanında en alta bu kadar yakınken yeni içerik görünümü aşağı çeker; bu kadar
// uzaklaşınca "en son mesaja in" düğmesi belirir.
const STICK_DISTANCE = 120;
const JUMP_BUTTON_DISTANCE = 240;

const TODAY_PANEL_KEY = "pulsecoach_today_panel";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localDateKey(): string {
  return dateKey(new Date());
}

/** Mobildeki tarih çipi: "7 Ekim Çarşamba" / "Wednesday, October 7". */
function longDayLabel(d: Date, language: string): string {
  if (language === "en") return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const day = d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  const weekday = d.toLocaleDateString("tr-TR", { weekday: "long" });
  return `${day} ${weekday}`;
}

/** Mesajların arasındaki gün ayracı: Bugün / Dün / uzun tarih. */
function daySeparatorLabel(key: string, language: PreferredLanguage, t: (tr: string, en: string) => string): string {
  const now = new Date();
  if (key === dateKey(now)) return t("Bugün", "Today");
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === dateKey(yesterday)) return t("Dün", "Yesterday");
  return longDayLabel(new Date(`${key}T00:00:00`), language);
}

function timeLabel(iso: string, language: PreferredLanguage): string {
  return new Date(iso).toLocaleTimeString(language === "en" ? "en-US" : "tr-TR", { hour: "2-digit", minute: "2-digit" });
}

interface StarterPrompt {
  icon: LucideIcon;
  label: string;
  hint: string;
  text: string;
}

/** Mesajın altındaki satır: saat, kopyala, sil (iki adımlı). Masaüstünde satırın üstüne gelince,
 * dokunmatikte balona dokununca görünür. */
function MessageActions({
  message,
  isOpen,
  isCopied,
  isConfirming,
  isDeleting,
  onCopy,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  message: DisplayMessage;
  isOpen: boolean;
  isCopied: boolean;
  isConfirming: boolean;
  isDeleting: boolean;
  onCopy: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const isUser = message.role === "user";
  const pinned = isOpen || isConfirming;
  const iconButton =
    "flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-[var(--surface-muted)] hover:text-zinc-800 disabled:opacity-50 lg:h-7 lg:w-7 dark:text-zinc-400 dark:hover:text-zinc-100";
  return (
    <div
      className={`${pinned ? "flex" : "hidden lg:flex"} min-h-7 items-center gap-1 text-xs text-zinc-500 transition-opacity dark:text-zinc-400 ${
        isUser ? "mr-9 justify-end lg:mr-10" : "ml-9 lg:ml-10"
      } ${pinned ? "" : "lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"}`}
    >
      {isConfirming ? (
        <>
          <span>{t("Mesaj kalıcı olarak silinsin mi?", "Delete this message permanently?")}</span>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="min-h-9 rounded-full px-2.5 font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50 lg:min-h-7 dark:text-red-400"
          >
            {isDeleting ? t("Siliniyor...", "Deleting...") : t("Sil", "Delete")}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            disabled={isDeleting}
            className="min-h-9 rounded-full px-2.5 font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50 lg:min-h-7"
          >
            {t("Vazgeç", "Cancel")}
          </button>
        </>
      ) : (
        <>
          <time dateTime={message.timestamp} className="px-1 tabular-nums">
            {timeLabel(message.timestamp, language)}
          </time>
          <button type="button" onClick={onCopy} aria-label={t("Mesajı kopyala", "Copy message")} title={t("Kopyala", "Copy")} className={iconButton}>
            {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {message.serverId != null ? (
            <button type="button" onClick={onAskDelete} aria-label={t("Mesajı sil", "Delete message")} title={t("Sil", "Delete")} className={iconButton}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { token, user } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  // getProfile'ı burada AYRICA fetch etmiyoruz - ProfileProvider (bkz.
  // layout.tsx) paylaşımlı cache'inden okuyoruz (2026-08-10 mimari borç
  // raporu, bulgu #7 - bu sayfa 5 bağımsız getProfile fetch'inden biriydi).
  const { profile } = useProfile();
  const needsProfileSetup = profile?.goal === null;
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  // Akışlı yanıt (2026-09-26): taslak metin ve araç çalışırken durum etiketi.
  const [draft, setDraft] = useState("");
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [todayMood, setTodayMoodKey] = useState<MoodKey | null>(null);
  const [dailyTip, setDailyTip] = useState<DailyTip | null>(null);
  const [isTipDismissed, setIsTipDismissed] = useState(false);
  // Mobildeki "Sohbeti Yönet" karşılığı, iki adımlı onay. "soft" = sıfırla (2026-10-06): veri
  // sunucuda kalır, ekran ve koçun bağlamı temiz sayfa görür. "hard" = kalıcı sil (2026-10-12,
  // mobilde vardı): tüm geçmiş sunucudan silinir, geri alınamaz.
  const [manageConfirm, setManageConfirm] = useState<"soft" | "hard" | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  // Mobil sohbetin "Bugün" paneli (2026-10-07): tarih çipi / ritim rozeti açıp kapatır; her
  // açılışta halka yeniden dolar ve cümle varyantı değişir (ringReplayTick). Açık/kapalı tercihi
  // yalnız bu tarayıcıda hatırlanır.
  // (app) sayfaları oturum çözülene kadar sunucuda yükleniyor görünümü verir, yani bu ilk
  // değer yalnız tarayıcıda hesaplanır.
  // Varsayılan KAPALI (2026-10-20): telefon tarayıcısında mesaj alanı kısa, açık panel ilk
  // girişte sohbetin tamamını kaplıyordu. Tarih çipindeki nokta yeni sağlık notunu haber verir.
  // Masaüstünde bu durum kullanılmaz (panel her zaman sağ sütunda).
  const [isTodayOpen, setIsTodayOpen] = useState(() => {
    try {
      return localStorage.getItem(TODAY_PANEL_KEY) === "open";
    } catch {
      return false; // gizli pencere vb.
    }
  });
  const [ringReplayTick, setRingReplayTick] = useState(0);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [isManageOpen, setIsManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);
  const [movementPct, setMovementPct] = useState<number | null>(null);
  const [nutritionPct, setNutritionPct] = useState<number | null>(null);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  // Mesaj eylemleri (2026-10-12): dokunmatikte seçili balon, kopyalandı işareti, tek mesaj silme.
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function toggleToday() {
    setIsTodayOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(TODAY_PANEL_KEY, next ? "open" : "closed");
      } catch {
        // yok say
      }
      return next;
    });
    setRingReplayTick((n) => n + 1);
  }

  // Telefonda panel mesajların üstünde açılır (mobildeki gibi): yazmaya başlayınca ya da
  // karartmaya dokununca kapanır. Tercih kaydedilmez - bir sonraki ziyarette yine açık gelir.
  function closeTodayOverlay() {
    if (!isDesktop) setIsTodayOpen(false);
  }

  useEffect(() => {
    if (!token) return;
    getWorkoutSessions(token, 1, 1)
      .then((sessions) => setMovementPct(sessions.some((s) => s.session_date === localDateKey()) ? 100 : 0))
      .catch(() => setMovementPct(null));
    getDailyNutritionSummary(token)
      .then((summary) =>
        setNutritionPct(summary.calorie_goal ? Math.min(100, Math.round((summary.total_calories_kcal / summary.calorie_goal) * 100)) : null)
      )
      .catch(() => setNutritionPct(null));
    getWeeklySummary(token)
      .then((summary) => setStreakDays(summary.streak_days))
      .catch(() => {});
    // Sohbette yeni kayıt oluşunca (koç öğün/antrenman yazdığında) ritim güncellensin.
  }, [token, messages.length]);

  async function handleManageConfirm() {
    if (!token || !manageConfirm) return;
    const isHard = manageConfirm === "hard";
    setError(null);
    setIsResetting(true);
    try {
      await (isHard ? deleteChatHistory(token) : clearChatHistory(token));
      setMessages([]);
      setManageConfirm(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : isHard
            ? t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?")
            : t("Sıfırlanamadı, tekrar dener misin?", "Couldn't reset, want to try again?")
      );
    } finally {
      setIsResetting(false);
    }
  }

  // Yönet menüsü: dışına tıklayınca ya da Escape ile kapanır.
  useEffect(() => {
    if (!isManageOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!manageRef.current?.contains(event.target as Node)) setIsManageOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setIsManageOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isManageOpen]);

  useEffect(() => {
    function computeGreeting() {
      setGreeting(getTimeGreeting(new Date(), language));
    }
    computeGreeting();
  }, [language]);

  useEffect(() => {
    if (!token) return;
    getDailyTip(token)
      .then((result) => setDailyTip(result))
      .catch(() => {});
    // language BİLEREK deps'te değil: backend artık ipucunun hem tr hem en
    // metnini birlikte döndürüyor (bkz. dailyTipText()), dil değişince
    // sadece GÖSTERİM diliyle ilgili yeniden render yeterli - yeniden fetch
    // gerekmiyor (2026-08-08: önceki "backend preferred_language'a göre TEK
    // dil döner" tasarımı PATCH /profile ile GET /daily-tip arasında bir
    // race condition'a yol açıyordu, bkz. proje belleği).
  }, [token]);

  // Günlük mesaj hakkı (2026-09-30): yalnız azalınca görünür.
  const [chatQuota, setChatQuota] = useState<QuotaStatus | null>(null);
  const refreshUsage = useCallback(() => {
    if (!token) return;
    getUsage(token)
      .then((usage) => setChatQuota(usage.chat))
      .catch(() => {});
  }, [token]);
  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);
  const quotaExhausted = chatQuota?.remaining === 0;
  const showQuotaHint = chatQuota?.remaining != null && chatQuota.remaining <= QUOTA_HINT_THRESHOLD;

  useEffect(() => {
    if (!token) return;
    getTodayMood(token)
      .then((mood) => setTodayMoodKey(mood?.mood_key ?? null))
      .catch(() => {});
  }, [token]);

  // Kayıt sonrası kullanıcı hiç yönlendirilmeden boş bir sohbete düşüyordu;
  // koç hedef/kısıtlama bilgisi olmadan zayıf öneriler veriyor. Zorla
  // yönlendirmek yerine (mevcut e2e akışları login sonrası doğrudan /chat'te
  // kalmayı varsayıyor) sadece boş sohbet ekranında nazik bir davet
  // gösterilir - needsProfileSetup artık yukarıda ProfileProvider'dan
  // türetiliyor, ayrı bir fetch/state gerekmiyor.

  useEffect(() => {
    if (!token) return;
    getChatHistory(token)
      .then((history) => setMessages(history.map(toDisplayMessage)))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("Geçmiş yüklenemedi.", "Couldn't load history.")))
      .finally(() => setIsLoadingHistory(false));
  }, [token, t]);

  // Yeni içerik görünümü yalnız kullanıcı zaten en alttaysa aşağı çeker: yukarıda eski bir
  // mesajı okurken akan taslak onu yerinden etmez. Anında kaydırma (yumuşak değil): akış
  // sırasında art arda gelen parçalarda yumuşak kaydırma geride kalıyordu.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isSending, draft, toolLabel, isLoadingHistory, openActionsId, confirmDeleteId]);

  // Mesaj alanı küçülünce (telefonda klavye açılınca, giriş kutusu uzayınca) en alttaki
  // mesaj klavyenin arkasında kalmasın.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoadingHistory]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickToBottomRef.current = distance < STICK_DISTANCE;
    setShowJumpToLatest(distance > JUMP_BUTTON_DISTANCE);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // Giriş kutusu içerikle büyür, sınırı CSS max-height (telefonda ~4, masaüstünde ~6 satır);
  // sonra kendi içinde kayar.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = parseFloat(getComputedStyle(el).maxHeight) || 160;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input, isDesktop]);

  async function sendMessage() {
    if (!token || !input.trim() || isSending || quotaExhausted) return;

    const text = input.trim();
    const localId = `local-${Date.now()}`;
    setInput("");
    setError(null);
    setOpenActionsId(null);
    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, { id: localId, role: "user", content: text, timestamp: new Date().toISOString() }]);
    setIsSending(true);
    setDraft("");
    setToolLabel(null);
    let streamStarted = false;

    try {
      const response = await streamChatMessage(token, text, (streamEvent) => {
        streamStarted = true;
        if (streamEvent.type === "tool") setToolLabel(streamEvent.label);
        else if (streamEvent.type === "token") {
          setToolLabel(null);
          setDraft((prev) => prev + streamEvent.text);
        } else if (streamEvent.type === "reset") setDraft("");
      });
      // Sunucu kimlikleri yanıtla gelir: satırlar yeniden bağlanmadan silinebilir hale gelir.
      setMessages((prev) => [
        ...prev.map((message) => (message.id === localId ? { ...message, serverId: response.user_message_id ?? undefined } : message)),
        {
          id: `local-reply-${Date.now()}`,
          serverId: response.assistant_message_id ?? undefined,
          role: "assistant",
          content: response.reply,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      // Akış yarıda koptuysa sunucu turu yine tamamlayıp kaydediyor - geçmişi
      // yeniden yükleyince kesin yanıt ekrana gelir.
      if (streamStarted) {
        getChatHistory(token)
          .then((history) => setMessages(history.map(toDisplayMessage)))
          .catch(() => {});
      }
      setError(
        err instanceof ApiError ? err.message : t("Mesaj gönderilemedi, tekrar dener misin?", "Couldn't send the message, want to try again?")
      );
    } finally {
      setIsSending(false);
      setDraft("");
      setToolLabel(null);
      refreshUsage();
    }
  }

  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    void sendMessage();
  }

  // Masaüstünde Enter gönderir, Shift+Enter yeni satır; telefonda Enter her zaman yeni satır
  // (ekran klavyesinde gönderme düğmesi var). IME bileşimi sürerken Enter'a dokunulmaz.
  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isDesktop || event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendMessage();
  }

  function applyPrompt(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  }

  async function copyMessage(message: DisplayMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 1600);
    } catch {
      // Pano kullanılamıyor (ör. güvenli olmayan bağlam) - sessizce geç.
    }
  }

  async function confirmDeleteMessage(message: DisplayMessage) {
    if (!token || message.serverId == null) return;
    setError(null);
    setDeletingId(message.id);
    try {
      await deleteChatMessage(token, message.serverId);
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const displayName = user ? displayNameOf(profile, user.email) : undefined;
  const userInitial = displayName?.charAt(0).toLocaleUpperCase(language === "en" ? "en-US" : "tr-TR");
  const todayLabel = longDayLabel(new Date(), language);

  // Hazır başlangıçlar: metni giriş kutusuna yazar (göndermez) - kullanıcı tamamlar ya da düzeltir.
  const starterPrompts: StarterPrompt[] = [
    {
      icon: UtensilsCrossed,
      label: t("Öğün kaydet", "Log a meal"),
      hint: t("Ne yediğini yaz, koçun kaydetsin", "Say what you ate, your coach logs it"),
      text: t("Bugün şunları yedim: ", "Today I ate: "),
    },
    {
      icon: Dumbbell,
      label: t("Antrenman kaydet", "Log a workout"),
      hint: t("Setlerini ya da kardiyonu anlat", "Describe your sets or cardio"),
      text: t("Bugün şu antrenmanı yaptım: ", "Today's workout: "),
    },
    {
      icon: ChartColumn,
      label: t("Haftamı özetle", "Sum up my week"),
      hint: t("Antrenman, beslenme ve ruh hali", "Training, nutrition and mood"),
      text: t("Bu haftamı özetler misin?", "Can you sum up my week?"),
    },
    {
      icon: Lightbulb,
      label: t("Bugün için öneri", "A suggestion for today"),
      hint: t("Hedefine ve bugünkü haline göre", "Based on your goal and how you feel"),
      text: t("Bugün için bana bir antrenman ve beslenme önerisi verir misin?", "Can you suggest a workout and meals for today?"),
    },
  ];

  // "Bugün" paneli: ruh hali, kişisel cümle, sağlık notu, ritim halkası. Masaüstünde sohbetin sağında
  // her zaman açık bir kenar sütunu (2026-10-08, "kopuk" bulgusu: üstte açılınca mesaj alanını
  // sıkıştırıyordu); telefonda mobildeki gibi mesajların üstüne açılır/kapanır (2026-10-20,
  // Android bulgusu: akışta duran panel mesaj alanını 0 yüksekliğe indiriyor, giriş kutusunu
  // sekme çubuğunun altına itiyordu).
  const todayPanel = (
    <section
      id="today-panel"
      aria-label={t("Bugün", "Today")}
      className="animate-fade-in-up flex shrink-0 flex-col gap-3 overflow-hidden rounded-[20px] bg-[#F8F8F8] bg-cover bg-center p-4 text-[#241D14] [background-image:url(/chat/today-panel-light.webp)] dark:bg-[linear-gradient(135deg,var(--surface),#3B1F15)] dark:text-[#F2EEE6] dark:[background-image:linear-gradient(135deg,#1a2226,#3B1F15)]"
    >
      <MoodPicker onMoodChange={setTodayMoodKey} variant="panel" />
      <p className="flex items-start gap-2 text-[13px] leading-[18px]">
        <span aria-hidden="true">✨</span>
        <span className="flex-1">
          {rhythmEncouragement(todayMood, movementPct, nutritionPct, displayName, t, ringReplayTick, streakDays)}
        </span>
      </p>
      {dailyTip && !isTipDismissed ? (
        <div className="flex items-start gap-2 border-t border-current/12 pt-2.5">
          <div className="flex-1">
            <p className="flex items-center gap-1.5 text-[13px] font-bold">
              <span aria-hidden="true">💚</span>
              {t("Sağlık Notu:", "Health Note:")}
            </p>
            <p className="mt-1 text-[13px] leading-[19px]">{dailyTipText(dailyTip, language).tip}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsTipDismissed(true)}
            aria-label={t("Notu kapat", "Dismiss note")}
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <div className="border-t border-current/12 pt-2.5">
        <RhythmRing movementPct={movementPct} nutritionPct={nutritionPct} moodPct={moodPctOf(todayMood)} variantSeed={ringReplayTick} />
      </div>
    </section>
  );

  const manageMenu =
    messages.length > 0 && !isLoadingHistory ? (
      <div ref={manageRef} className="relative">
        <button
          type="button"
          onClick={() => setIsManageOpen((open) => !open)}
          aria-label={t("Sohbeti yönet", "Manage chat")}
          aria-expanded={isManageOpen}
          className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-[var(--surface-muted)] dark:text-zinc-400"
        >
          <MoreVertical className="h-[18px] w-[18px]" />
        </button>
        {isManageOpen ? (
          <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setIsManageOpen(false);
                setManageConfirm("soft");
              }}
              disabled={isSending}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-zinc-700 hover:bg-[var(--surface-muted)] disabled:opacity-50 dark:text-zinc-200"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t("Sohbeti sıfırla", "Reset chat")}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsManageOpen(false);
                setManageConfirm("hard");
              }}
              disabled={isSending}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("Sohbeti kalıcı olarak sil", "Permanently delete chat")}
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  const coachStatus = isSending
    ? toolLabel
      ? `${toolLabel}…`
      : t("Yazıyor…", "Typing…")
    : t("Kayıtlarına bakarak yanıt verir", "Replies based on your logs");

  return (
    // Sabit yükseklik: üst kısım ve giriş kutusu yerinde kalır, yalnız mesajlar kayar. Görünüm
    // yüksekliğinden üst menü (4rem) ve ana alanın dolguları düşülür (telefonda alttaki sekme
    // çubuğu için pb-28).
    // Telefonda klavye açılınca sekme çubuğu gizlenir ve fark küçülür (globals.css --pc-chat-offset).
    <div className="flex h-[calc(100dvh-var(--pc-chat-offset))] min-h-[16rem] gap-6 lg:min-h-[34rem]">
      {/* Masaüstünde sohbet tek bir pencere (2026-10-12): koç başlığı, ortalanmış okuma sütunu,
          altta büyüyen giriş kutusu. Telefonda mobil uygulamadaki gibi çerçevesiz. */}
      <section
        aria-label={t("Sohbet", "Chat")}
        className="flex min-w-0 flex-1 flex-col gap-4 lg:gap-0 lg:overflow-hidden lg:rounded-[24px] lg:border lg:border-[rgba(245,162,107,0.24)] lg:bg-white/70 lg:shadow-[0_4px_18px_rgba(245,162,107,0.2)] dark:lg:border-white/10 dark:lg:bg-white/[0.035] dark:lg:shadow-none"
      >
        {isDesktop ? (
          <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-6 py-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--tone-accent)]/12 text-[var(--tone-accent)]">
              <PulseMark size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold leading-tight text-zinc-900 dark:text-zinc-50">{t("Koçun", "Your coach")}</h1>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
                {coachStatus}
              </p>
            </div>
            <p className="hidden text-sm text-zinc-500 xl:block dark:text-zinc-400">{todayLabel}</p>
            {manageMenu}
          </header>
        ) : (
          // Mobil sohbet üst çubuğu: tarih çipi + ritim rozeti ("Bugün" panelini açar), sağda yönet.
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={toggleToday}
                aria-expanded={isTodayOpen}
                aria-controls="today-panel"
                className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-full border-[1.5px] border-[var(--tone-accent)] bg-[#FD8D64] px-3.5 text-[13px] font-bold text-[#F5F3EE] dark:bg-[#3B1F15]"
              >
                <span className="truncate">{todayLabel}</span>
                {dailyTip && !isTipDismissed ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F5F3EE]" aria-hidden="true" /> : null}
                {isTodayOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={toggleToday}
                aria-label={t("Bugünkü ritmin", "Today's rhythm")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--tone-accent)] bg-[#FD8D64] dark:bg-[#3B1F15]"
              >
                <MiniRhythmRing
                  movementPct={movementPct}
                  nutritionPct={nutritionPct}
                  moodPct={moodPctOf(todayMood)}
                  replayKey={ringReplayTick}
                  trackColor="rgba(245,243,238,0.28)"
                />
              </button>
            </div>
            {manageMenu}
          </div>
        )}

        {manageConfirm ? (
          <div
            className={`animate-fade-in-up flex flex-col gap-3 rounded-2xl border bg-[var(--surface)] p-3 text-sm sm:flex-row sm:items-center lg:mx-6 lg:mt-4 ${
              manageConfirm === "hard" ? "border-red-500/50" : "border-[var(--border-strong)]"
            }`}
          >
            <p className="flex-1 text-zinc-600 dark:text-zinc-300">
              {manageConfirm === "hard"
                ? t(
                    "GERİ ALINAMAZ - tüm sohbet geçmişin sunucudan tamamen silinir. Öğün ve antrenman kayıtların etkilenmez.",
                    "CANNOT BE UNDONE - your entire chat history is permanently removed from the server. Your meal and workout logs are not affected."
                  )
                : t(
                    "Ekranı ve koçun bağlamını temizler, sıfırdan başlarsın - geçmiş mesajların sunucuda saklanmaya devam eder.",
                    "Clears the screen and the coach's context so you start fresh - your past messages stay saved on the server."
                  )}
            </p>
            <div className="flex shrink-0 gap-2">
              <PrimaryButton
                type="button"
                onClick={handleManageConfirm}
                disabled={isResetting || isSending}
                className={manageConfirm === "hard" ? "!bg-red-600 !text-white" : ""}
              >
                {manageConfirm === "hard"
                  ? isResetting
                    ? t("Siliniyor...", "Deleting...")
                    : t("Kalıcı Olarak Sil", "Delete Permanently")
                  : isResetting
                    ? t("Sıfırlanıyor...", "Resetting...")
                    : t("Onayla, Sıfırla", "Confirm, Reset")}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => setManageConfirm(null)} disabled={isResetting}>
                {t("Vazgeç", "Cancel")}
              </SecondaryButton>
            </div>
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overscroll-contain lg:px-6 lg:py-5">
            <div className="mx-auto flex min-h-full max-w-[820px] flex-col gap-3 lg:gap-1.5">
              {isLoadingHistory ? (
                <LoadingState label={t("Sohbet geçmişi yükleniyor...", "Loading chat history...")} />
              ) : messages.length === 0 ? (
                <div className="animate-fade-in-up flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                  <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--tone-accent)]/10 lg:h-14 lg:w-14">
                    <MessageCircle className="h-6 w-6 text-[var(--tone-accent)] lg:h-7 lg:w-7" />
                  </div>
                  {greeting && displayName ? (
                    <p className="text-2xl font-medium text-zinc-900 lg:text-3xl dark:text-zinc-50">
                      {greeting}, {displayName}!
                    </p>
                  ) : null}
                  <p className="max-w-xs text-sm text-zinc-500 lg:max-w-md lg:text-base">{getMoodAwareSubtext(todayMood, language)}</p>
                  {needsProfileSetup ? (
                    <Link
                      href="/profile/settings"
                      className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[var(--tone-accent)]/30 bg-[var(--tone-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--tone-accent)] transition-colors hover:bg-[var(--tone-accent)]/15"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("Daha kişisel öneriler için hedefini/bilgilerini paylaş", "Share your goals/info for more personal suggestions")}
                    </Link>
                  ) : null}
                  <ul className="mt-5 grid w-full max-w-xl gap-2.5 text-left sm:grid-cols-2">
                    {starterPrompts.map(({ icon: Icon, label, hint, text }) => (
                      <li key={label}>
                        <button
                          type="button"
                          onClick={() => applyPrompt(text)}
                          className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-3 text-left transition-colors hover:border-[var(--tone-accent)]/60 hover:bg-[var(--tone-accent)]/5"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-accent)]/10 text-[var(--tone-accent)]">
                            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">{label}</span>
                            <span className="block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const dayKey = dateKey(new Date(message.timestamp));
                  const startsDay = index === 0 || dateKey(new Date(messages[index - 1].timestamp)) !== dayKey;
                  return (
                    <div key={message.id} className="flex flex-col gap-3 lg:gap-1.5">
                      {startsDay ? (
                        <div
                          role="separator"
                          className="my-1 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 before:h-px before:flex-1 before:bg-[var(--border-subtle)] after:h-px after:flex-1 after:bg-[var(--border-subtle)] dark:text-zinc-400"
                        >
                          {daySeparatorLabel(dayKey, language, t)}
                        </div>
                      ) : null}
                      <div className="group animate-fade-in-up flex flex-col">
                        <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                          {isUser ? null : <Avatar role="assistant" />}
                          <div
                            data-testid="chat-message"
                            data-role={message.role}
                            // Dokunmatikte balona dokunmak altındaki eylem satırını açar/kapatır
                            // (masaüstünde satırın üstüne gelmek yeterli).
                            onClick={() => setOpenActionsId((current) => (current === message.id ? null : message.id))}
                            // Mobil sohbet kimliği (chat-identity.ts): koç balonu şeftali/kahve. Kullanıcı
                            // balonu mobilde #FF5A1F + beyaz (3,1:1, AA altı) - web'de aynı aileden ama
                            // okunur ton dolgusu (5,3:1) kalıyor.
                            className={`max-w-[80%] rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed lg:max-w-[76%] ${
                              isUser
                                ? "rounded-br-md bg-[var(--tone-fill)] text-[var(--tone-on-fill)]"
                                : "rounded-bl-md bg-[#FFCDBB] text-[#241D14] dark:bg-[#382219] dark:text-[#F5F3EE]"
                            }`}
                          >
                            <MessageContent content={message.content} isUser={isUser} />
                          </div>
                          {isUser ? <Avatar role="user" initial={userInitial} /> : null}
                        </div>
                        <MessageActions
                          message={message}
                          isOpen={openActionsId === message.id}
                          isCopied={copiedId === message.id}
                          isConfirming={confirmDeleteId === message.id}
                          isDeleting={deletingId === message.id}
                          onCopy={() => void copyMessage(message)}
                          onAskDelete={() => setConfirmDeleteId(message.id)}
                          onCancelDelete={() => setConfirmDeleteId(null)}
                          onConfirmDelete={() => void confirmDeleteMessage(message)}
                        />
                      </div>
                    </div>
                  );
                })
              )}
              {isSending ? (
                <div className="animate-fade-in-up flex items-end justify-start gap-2">
                  <Avatar role="assistant" />
                  {draft ? (
                    <div
                      data-testid="chat-draft"
                      aria-live="polite"
                      className="max-w-[80%] rounded-[20px] rounded-bl-md bg-[#FFCDBB] px-4 py-2.5 text-[15px] leading-relaxed text-[#241D14] lg:max-w-[76%] dark:bg-[#382219] dark:text-[#F5F3EE]"
                    >
                      <MessageContent content={draft} isUser={false} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-[20px] rounded-bl-md bg-[#FFCDBB] px-4 py-2 text-[#241D14] dark:bg-[#382219] dark:text-[#F5F3EE]">
                      <TypingIndicator />
                      {toolLabel ? (
                        <span data-testid="chat-tool-status" aria-live="polite" className="text-xs opacity-75">
                          {toolLabel}…
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          {showJumpToLatest ? (
            <button
              type="button"
              onClick={jumpToLatest}
              aria-label={t("En son mesaja in", "Scroll to latest message")}
              className="animate-fade-in-up absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--tone-fill)] text-[var(--tone-on-fill)] shadow-lg transition-transform hover:-translate-y-0.5 lg:right-6"
            >
              <ArrowDown className="h-5 w-5" />
            </button>
          ) : null}
          {!isDesktop && isTodayOpen ? (
            <>
              <button
                type="button"
                onClick={closeTodayOverlay}
                aria-label={t("Bugün panelini kapat", "Close today panel")}
                className="pc-fade-in absolute inset-0 z-10 bg-black/35 dark:bg-black/50"
              />
              <div className="absolute inset-x-0 top-0 z-20 max-h-full overflow-y-auto overscroll-contain rounded-[20px]">
                {todayPanel}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 lg:border-t lg:border-[var(--border-subtle)] lg:px-6 lg:pb-4 lg:pt-4">
          {error ? <ErrorBanner message={error} /> : null}

          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[820px]">
            <div className="flex items-end gap-2 rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-input)] py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-[var(--tone-accent)] focus-within:ring-1 focus-within:ring-[var(--tone-accent)]">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onFocus={closeTodayOverlay}
                maxLength={MAX_MESSAGE_LENGTH}
                aria-label={t("Mesajın", "Your message")}
                placeholder={
                  quotaExhausted ? t("Yarın yeniden konuşalım", "Let's talk again tomorrow") : getMoodAwarePlaceholder(todayMood, language)
                }
                disabled={quotaExhausted}
                className="max-h-28 min-h-11 flex-1 resize-none lg:max-h-40 bg-transparent py-2.5 text-[15px] leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60 dark:text-zinc-100"
              />
              <button
                type="submit"
                // Odak giriş kutusunda kalır (telefonda klavye açık kalır, mesajlaşma uygulamaları
                // gibi). Yoksa basınca klavye kapanıp sekme çubuğu geri geliyor, düzen kayıyor ve
                // dokunuş düğmeyi ıskalıyordu (2026-10-20, Android bulgusu).
                onMouseDown={(event) => event.preventDefault()}
                aria-label={t("Gönder", "Send")}
                title={t("Gönder", "Send")}
                disabled={isSending || !input.trim() || quotaExhausted}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--tone-fill)] text-[var(--tone-on-fill)] transition-all duration-200 hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                {showQuotaHint ? (
                  <span data-testid="chat-quota-hint" aria-live="polite" className={quotaExhausted ? "text-red-600 dark:text-red-400" : ""}>
                    {quotaExhausted
                      ? t("Bugünkü mesaj hakkın doldu. Hakların gece yarısı yenilenir.", "You've used today's messages. Your limit resets at midnight.")
                      : t(`Bugün ${chatQuota?.remaining} mesaj hakkın kaldı.`, `${chatQuota?.remaining} messages left today.`)}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {input.length >= LENGTH_HINT_FROM ? (
                  <span className="tabular-nums">
                    {input.length.toLocaleString(language === "en" ? "en-US" : "tr-TR")} / {MAX_MESSAGE_LENGTH.toLocaleString(language === "en" ? "en-US" : "tr-TR")}
                  </span>
                ) : null}
                <span className="hidden lg:inline">{t("Enter gönderir · Shift+Enter yeni satır", "Enter to send · Shift+Enter for a new line")}</span>
              </span>
            </div>
          </form>
        </div>
      </section>

      {isDesktop ? (
        <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto">
          {todayPanel}
          <section aria-labelledby="starter-title" className="pc-panel p-4">
            <h2 id="starter-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Hızlı başlat", "Quick start")}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">{t("Dokun, cümleyi tamamla, gönder.", "Pick one, finish the sentence, send.")}</p>
            <ul className="mt-2.5 flex flex-col gap-1">
              {starterPrompts.map(({ icon: Icon, label, hint, text }) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => applyPrompt(text)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--tone-accent)]/12 text-[var(--tone-accent)]">
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">{label}</span>
                      <span className="block truncate text-xs text-zinc-500">{hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      ) : null}
    </div>
  );
}
