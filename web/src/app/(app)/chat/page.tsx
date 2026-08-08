"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Bot, MessageCircle, Send, Sparkles, User, X } from "lucide-react";
import {
  ApiError,
  getChatHistory,
  getDailyTip,
  getProfile,
  getTodayMood,
  sendChatMessage,
  type ConversationMessage,
  type DailyTip,
  type MoodKey,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { getMoodAwareSubtext, getTimeGreeting, nameFromEmail } from "@/lib/greeting";
import { ErrorBanner, LoadingState, PrimaryButton, TextInput } from "@/components/ui";
import { MoodPicker } from "@/components/MoodPicker";

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

export default function ChatPage() {
  const { token, user } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [todayMood, setTodayMoodKey] = useState<MoodKey | null>(null);
  const [dailyTip, setDailyTip] = useState<DailyTip | null>(null);
  const [isTipDismissed, setIsTipDismissed] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
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
    // language deps'te: backend ipucunu preferred_language'a göre üretiyor
    // (bkz. GET /daily-tip) - burada dile bağlı olmasa şu an sayfa
    // navigasyonuyla remount olduğu için gizli kalıyor ama gizli bir
    // varsayıma dayanmak kırılgan (bkz. mobil'de aynı kök nedenden
    // bulunan canlı bug, 2026-08-08 - tab'lar unmount olmadığı için orada
    // hemen ortaya çıktı).
  }, [token, language]);

  useEffect(() => {
    if (!token) return;
    getTodayMood(token)
      .then((mood) => setTodayMoodKey(mood?.mood_key ?? null))
      .catch(() => {});
  }, [token]);

  // Kayıt sonrası kullanıcı hiç yönlendirilmeden boş bir sohbete düşüyordu;
  // koç hedef/kısıtlama bilgisi olmadan zayıf öneriler veriyor. Zorla
  // yönlendirmek yerine (mevcut e2e akışları login sonrası doğrudan /chat'te
  // kalmayı varsayıyor) sadece boş sohbet ekranında nazik bir davet gösterilir.
  useEffect(() => {
    if (!token) return;
    getProfile(token)
      .then((profile) => setNeedsProfileSetup(profile.goal === null))
      .catch(() => {});
  }, [token]);

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
      <MoodPicker />
      {dailyTip && !isTipDismissed ? (
        <div className="animate-fade-in-up flex items-start gap-2 rounded-lg border border-accent-warm/25 bg-accent-warm/10 px-3 py-2 text-xs">
          <span className="mt-0.5 shrink-0 text-sm leading-none">{dailyTip.icon}</span>
          <p className="flex-1 leading-snug text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-accent-warm">{dailyTip.category}:</span> {dailyTip.tip}
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
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
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
                className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-accent text-white"
                    : "bg-[var(--surface-muted)] text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {message.content}
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
          placeholder={t("Bir mesaj yaz...", "Write a message...")}
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
