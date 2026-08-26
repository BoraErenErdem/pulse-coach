"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Bot, MessageCircle, Send, Sparkles, User, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
  ApiError,
  dailyTipText,
  getChatHistory,
  getDailyTip,
  getTodayMood,
  sendChatMessage,
  type ConversationMessage,
  type DailyTip,
  type MoodKey,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { getMoodAwarePlaceholder, getMoodAwareSubtext, getTimeGreeting, nameFromEmail } from "@/lib/greeting";
import { ErrorBanner, LoadingState, PrimaryButton, TextInput } from "@/components/ui";
import { MoodPicker } from "@/components/MoodPicker";

// 2026-08-26 güvenlik denetimi: react-markdown'ın kendisi ham HTML render
// etmiyor (rehype-raw yok) ama üretilen `<a href>` değerini olduğu gibi
// DOM'a yazıyordu - LLM çıktısı (koç cevabı) `javascript:`/`data:` gibi bir
// şema üretirse (backend bunu şu an filtrelemiyor) teorik bir XSS vektörü.
// Sadece http(s)/mailto/göreli linklere izin veriliyor.
const _SAFE_HREF_SCHEMES = /^(https?:|mailto:)/i;
function isSafeMarkdownHref(href: string | undefined): boolean {
  if (!href) return false;
  // Şema içermeyen (göreli) linkler güvenli - "javascript:..." gibi bir
  // şema, ":" öncesinde harf/rakam/+/-/. dışında karakter olamayacağından
  // regex'e YAKALANMAZ, bu yüzden ayrıca ":" var mı diye bakılıyor.
  if (!href.includes(":")) return true;
  return _SAFE_HREF_SCHEMES.test(href);
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function toDisplayMessage(message: ConversationMessage): DisplayMessage {
  return {
    id: String(message.id),
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
  };
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  const isUser = role === "user";
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        isUser
          ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
          : "bg-accent/10 text-accent"
      }`}
    >
      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
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

// Koç (LLM) cevapları markdown üretiyor (**kalın**, numaralı listeler vb.)
// ama eskiden {message.content} düz string olarak basılıyordu - kullanıcı
// ekranda yıldızları görüyordu (2026-08-14, kullanıcı canlı sohbette
// yakaladı). remarkBreaks tek satır sonlarını da <br> yapıyor ki eski
// whitespace-pre-wrap görünümüyle tutarlı kalsın.
function MessageContent({ content, isUser }: { content: string; isUser: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        // Uzun/detaylı cevaplarda koç "### Başlık" gibi markdown başlıkları
        // üretebiliyor (bkz. backend MAX_REPLY_SENTENCES_DETAILED, 2026-08-14)
        // - başlıksız bırakılırsa react-markdown varsayılan <h1>-<h6> boyutunu
        // kullanır, bu da balon içinde orantısız büyük durur. Rengi BİLEREK
        // belirtmiyoruz (currentColor/inherit) - bubble zaten user/assistant
        // rengini üstte ayarlıyor, burada sabitlersek karanlık modda/user
        // balonunda (beyaz metin) tutarsız kalır.
        h1: ({ children }) => <p className="mb-1.5 mt-2 first:mt-0 text-base font-bold">{children}</p>,
        h2: ({ children }) => <p className="mb-1.5 mt-2 first:mt-0 text-base font-bold">{children}</p>,
        h3: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-semibold">{children}</p>,
        h4: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-semibold">{children}</p>,
        h5: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-semibold">{children}</p>,
        h6: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-semibold">{children}</p>,
        hr: () => <hr className="my-2 border-current opacity-20" />,
        // LLM detaylı cevaplarda (bkz. MAX_REPLY_SENTENCES_DETAILED) bazen
        // markdown TABLOSU da üretebiliyor (ör. makro besin karşılaştırması,
        // canlı testte görüldü 2026-08-14) - stilsiz bırakılırsa tarayıcı
        // varsayılan tablosu balonun dışına taşabilir; overflow-x-auto
        // wrapper + border-current (tema rengine bağlı, sabit siyah değil)
        // ile hem taşmayı hem karanlık modda görünmezliği önlüyoruz.
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-current/20 px-2 py-1 text-left font-semibold">{children}</th>
        ),
        td: ({ children }) => <td className="border border-current/20 px-2 py-1">{children}</td>,
        a: ({ children, href }) => {
          if (!isSafeMarkdownHref(href)) {
            // Güvensiz şema (ör. "javascript:") - linki devre dışı bırak,
            // metni yine de göster (içerik kaybolmasın).
            return <span>{children}</span>;
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={isUser ? "underline underline-offset-2" : "text-accent underline underline-offset-2"}
            >
              {children}
            </a>
          );
        },
        code: ({ children }) => (
          <code
            className={`rounded px-1 py-0.5 text-xs ${
              isUser ? "bg-white/20" : "bg-black/10 dark:bg-white/10"
            }`}
          >
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
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
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [todayMood, setTodayMoodKey] = useState<MoodKey | null>(null);
  const [dailyTip, setDailyTip] = useState<DailyTip | null>(null);
  const [isTipDismissed, setIsTipDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !input.trim() || isSending) return;

    const text = input.trim();
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: text }]);
    setIsSending(true);

    try {
      const response = await sendChatMessage(token, text);
      setMessages((prev) => [
        ...prev,
        { id: `local-reply-${Date.now()}`, role: "assistant", content: response.reply },
      ]);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("Mesaj gönderilemedi, tekrar dener misin?", "Couldn't send the message, want to try again?")
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <MoodPicker onMoodChange={setTodayMoodKey} />
      {dailyTip && !isTipDismissed ? (
        <div className="animate-fade-in-up flex items-start gap-2 rounded-lg border border-accent-warm/25 bg-accent-warm/10 px-3 py-2 text-xs">
          <span className="mt-0.5 shrink-0 text-sm leading-none">{dailyTip.icon}</span>
          <p className="flex-1 leading-snug text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-accent-warm">{dailyTipText(dailyTip, language).category}:</span>{" "}
            {dailyTipText(dailyTip, language).tip}
          </p>
          <button
            type="button"
            onClick={() => setIsTipDismissed(true)}
            className="shrink-0 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
            aria-label={t("İpucunu kapat", "Dismiss tip")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {isLoadingHistory ? (
          <LoadingState label={t("Sohbet geçmişi yükleniyor...", "Loading chat history...")} />
        ) : messages.length === 0 ? (
          <div className="animate-fade-in-up flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
              <MessageCircle className="h-6 w-6 text-accent" />
            </div>
            {greeting && user ? (
              <p className="font-display text-2xl text-zinc-900 dark:text-zinc-50">
                {greeting}, {nameFromEmail(user.email)}!
              </p>
            ) : null}
            <p className="max-w-xs text-sm text-zinc-500">{getMoodAwareSubtext(todayMood, language)}</p>
            {needsProfileSetup ? (
              <Link
                href="/profile"
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t("Daha kişisel öneriler için hedefini/bilgilerini paylaş", "Share your goals/info for more personal suggestions")}
              </Link>
            ) : null}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`animate-fade-in-up flex items-end gap-2 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" ? <Avatar role="assistant" /> : null}
              <div
                data-testid="chat-message"
                data-role={message.role}
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-accent-solid text-on-accent-solid"
                    : "bg-[var(--surface-muted)] text-zinc-900 dark:text-zinc-100"
                }`}
              >
                <MessageContent content={message.content} isUser={message.role === "user"} />
              </div>
              {message.role === "user" ? <Avatar role="user" /> : null}
            </div>
          ))
        )}
        {isSending ? (
          <div className="animate-fade-in-up flex items-end justify-start gap-2">
            <Avatar role="assistant" />
            <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-2">
              <TypingIndicator />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <TextInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={getMoodAwarePlaceholder(todayMood, language)}
          disabled={isSending}
          className="flex-1"
        />
        <PrimaryButton type="submit" disabled={isSending || !input.trim()}>
          <Send className="h-4 w-4" />
          {t("Gönder", "Send")}
        </PrimaryButton>
      </form>
    </div>
  );
}
