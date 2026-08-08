import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Link } from "expo-router";
import { Bot, MessageCircle, Send, User, X } from "lucide-react-native";
import {
  ApiError,
  dailyTipText,
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
import { getMoodAwareSubtext, getTimeGreeting, nameFromEmail } from "@/lib/greeting";
import { useLanguage, useT } from "@/lib/language-context";
import { ErrorBanner, FormInput, colors } from "@/components/ui";
import { MoodPicker } from "@/components/mood-picker";

// web/src/app/(app)/chat/page.tsx'in mobil portu - Faz M2 çekirdek değer
// döngüsü. Aynı veri akışı (geçmiş+günün ipucu+bugünkü mood+profil kontrolü
// paralel yükleniyor), TypingIndicator yerine basit ActivityIndicator.
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
    <View style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarAssistant]}>
      {isUser ? <User size={14} color="#52525b" /> : <Bot size={14} color={colors.accent} />}
    </View>
  );
}

export default function ChatTab() {
  const { token, user } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayMood, setTodayMoodKey] = useState<MoodKey | null>(null);
  const [dailyTip, setDailyTip] = useState<DailyTip | null>(null);
  const [isTipDismissed, setIsTipDismissed] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const listRef = useRef<FlatList<DisplayMessage>>(null);

  const greeting = getTimeGreeting(new Date(), language);

  // web'de her Sohbet sayfası ziyaretinde bileşen yeniden mount olduğu için
  // (route değişimi) yeni bir ipucu otomatik geliyor - mobile'da tab'lar
  // unmount OLMADIĞI için (bkz. proje belleği) aynı davranışı elde etmek
  // için useFocusEffect kullanılıyor: sekmeye HER dönüşte (X ile kapatılmış
  // olsa da olmasa da) taze bir ipucu çekilip dismiss durumu sıfırlanıyor
  // (2026-08-08, kullanıcı isteği: web'deki "sekme değişince yeni ipucu"
  // davranışı mobile'da da olsun). language BİLEREK deps'te değil: backend
  // ipucunun hem tr hem en metnini birlikte döndürüyor (bkz. dailyTipText()).
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      setIsTipDismissed(false);
      getDailyTip(token)
        .then((result) => setDailyTip(result))
        .catch(() => {});
    }, [token])
  );

  useEffect(() => {
    if (!token) return;
    getTodayMood(token)
      .then((mood) => setTodayMoodKey(mood?.mood_key ?? null))
      .catch(() => {});
  }, [token]);

  // Kayıt sonrası profil bilgisi yoksa koç zayıf öneriler veriyor - zorla
  // yönlendirmek yerine boş sohbet ekranında nazik bir davet gösteriliyor
  // (web'deki aynı bilinçli kapsam kararı).
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
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages, isSending]);

  async function handleSubmit() {
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
      setError(err instanceof ApiError ? err.message : t("Mesaj gönderilemedi, tekrar dener misin?", "Couldn't send the message, want to try again?"));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <MoodPicker />

        {dailyTip && !isTipDismissed ? (
          <View style={styles.tipBanner}>
            <Text style={styles.tipIcon}>{dailyTip.icon}</Text>
            <Text style={styles.tipText}>
              <Text style={styles.tipCategory}>{dailyTipText(dailyTip, language).category}: </Text>
              {dailyTipText(dailyTip, language).tip}
            </Text>
            <Pressable onPress={() => setIsTipDismissed(true)} hitSlop={8}>
              <X size={14} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}

        {isLoadingHistory ? (
          <View style={styles.centerFill}>
            <ActivityIndicator />
            <Text style={styles.loadingLabel}>{t("Sohbet geçmişi yükleniyor...", "Loading chat history...")}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <MessageCircle size={26} color={colors.accent} />
                </View>
                {user ? (
                  <Text style={styles.emptyGreeting}>
                    {greeting}, {nameFromEmail(user.email)}!
                  </Text>
                ) : null}
                <Text style={styles.emptySubtext}>{getMoodAwareSubtext(todayMood, language)}</Text>
                {needsProfileSetup ? (
                  <Link href="/more" style={styles.ctaLink}>
                    ✨ {t("Daha kişisel öneriler için hedefini/bilgilerini paylaş", "Share your goals/info for more personal suggestions")}
                  </Link>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.messageRow,
                  item.role === "user" ? styles.messageRowUser : styles.messageRowAssistant,
                ]}
              >
                {item.role === "assistant" ? <Avatar role="assistant" /> : null}
                <View
                  style={[
                    styles.bubble,
                    item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
                  ]}
                >
                  <Text style={item.role === "user" ? styles.bubbleTextUser : styles.bubbleText}>
                    {item.content}
                  </Text>
                </View>
                {item.role === "user" ? <Avatar role="user" /> : null}
              </View>
            )}
            ListFooterComponent={
              isSending ? (
                <View style={[styles.messageRow, styles.messageRowAssistant]}>
                  <Avatar role="assistant" />
                  <View style={[styles.bubble, styles.bubbleAssistant]}>
                    <ActivityIndicator size="small" />
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {error ? (
          <View style={{ paddingHorizontal: 16 }}>
            <ErrorBanner message={error} />
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <FormInput
            value={input}
            onChangeText={setInput}
            placeholder={t("Bir mesaj yaz...", "Write a message...")}
            editable={!isSending}
            style={{ flex: 1 }}
            multiline
          />
          <Pressable
            onPress={handleSubmit}
            disabled={isSending || !input.trim()}
            style={[styles.sendButton, (isSending || !input.trim()) && { opacity: 0.5 }]}
          >
            <Send size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  tipBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fdf1e0",
  },
  tipIcon: {
    fontSize: 14,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  tipCategory: {
    fontWeight: "700",
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#e8f2fd",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyGreeting: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 280,
  },
  ctaLink: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
    textAlign: "center",
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageRowAssistant: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarUser: {
    backgroundColor: "#e4e4e7",
  },
  avatarAssistant: {
    backgroundColor: "#e8f2fd",
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleUser: {
    backgroundColor: colors.accent,
  },
  bubbleAssistant: {
    backgroundColor: colors.surfaceMuted,
  },
  bubbleText: {
    fontSize: 14,
    color: colors.text,
  },
  bubbleTextUser: {
    fontSize: 14,
    color: "#fff",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 16,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
