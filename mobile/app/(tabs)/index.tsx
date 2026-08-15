import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Link } from "expo-router";
import { Bot, MessageCircle, Send, User } from "lucide-react-native";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import {
  ApiError,
  dailyTipText,
  getChatHistory,
  getDailyNutritionSummary,
  getDailyTip,
  getTodayMood,
  getWorkoutSessions,
  MOOD_KEYS,
  sendChatMessage,
  type ConversationMessage,
  type DailyTip,
  type MoodKey,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getMoodAwarePlaceholder, getMoodAwareSubtext, getTimeGreeting, nameFromEmail } from "@/lib/greeting";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { ErrorBanner, FormInput, PulseMark, type ThemeColors, useThemeColors } from "@/components/ui";
import { MoodPicker } from "@/components/mood-picker";
import { RhythmRing } from "@/components/rhythm-ring";
import { QuickAddMenu } from "@/components/quick-add-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dismissible } from "@/components/dismissible";

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

// Koç (LLM) cevapları markdown üretiyor (**kalın**, numaralı listeler vb.)
// ama eskiden {item.content} düz <Text> içine basılıyordu - kullanıcı
// ekranda yıldızları görüyordu (2026-08-14, kullanıcı canlı sohbette
// yakaladı). breaks:true tek satır sonlarını da satır kırılımı yapıyor ki
// eski görünümle tutarlı kalsın. Instance modül seviyesinde - her render'da
// yeniden oluşturulmasın.
const markdownItInstance = MarkdownIt({ typographer: true, breaks: true });

function buildMarkdownStyle(textColor: string, codeBackground: string) {
  // react-native-markdown-display'in heading1-6/hr varsayılanları (bkz.
  // node_modules/.../styles.js) renk TANIMLAMIYOR (heading'ler) ya da SABİT
  // siyah kullanıyor (hr) - koç artık uzun/detaylı cevaplarda "### Başlık"
  // üretebildiği için (bkz. backend MAX_REPLY_SENTENCES_DETAILED, 2026-08-14)
  // bunlara textColor'a bağlı EXPLICIT stil vermek gerekiyor, yoksa karanlık
  // modda ya da user balonunda (beyaz metin) başlık/ayraç görünmez kalabilirdi.
  const heading = { color: textColor, fontWeight: "700" as const, marginTop: 6, marginBottom: 4 };
  return {
    body: { fontSize: 14, color: textColor },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { fontWeight: "700" as const },
    em: { fontStyle: "italic" as const },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { flexDirection: "row" as const },
    code_inline: {
      borderRadius: 4,
      paddingHorizontal: 4,
      fontSize: 12,
      backgroundColor: codeBackground,
      color: textColor,
    },
    heading1: { ...heading, fontSize: 18 },
    heading2: { ...heading, fontSize: 17 },
    heading3: { ...heading, fontSize: 16 },
    heading4: { ...heading, fontSize: 15 },
    heading5: { ...heading, fontSize: 14 },
    heading6: { ...heading, fontSize: 14 },
    hr: { backgroundColor: textColor, opacity: 0.2, height: 1, marginVertical: 8 },
    // Kütüphanenin varsayılan tablo stili borderColor'ı SABİT '#000000'
    // kullanıyor (bkz. node_modules/.../styles.js) - LLM detaylı cevaplarda
    // (bkz. backend MAX_REPLY_SENTENCES_DETAILED) bazen tablo da üretebiliyor
    // (canlı testte görüldü, 2026-08-14), sabit siyah kenarlık karanlık
    // modda/renkli balonda görünmez kalırdı.
    table: { borderWidth: 1, borderColor: `${textColor}4D`, borderRadius: 3, marginBottom: 8 },
    tr: { borderBottomWidth: 1, borderColor: `${textColor}33`, flexDirection: "row" as const },
    // flex:1 DEĞİL minWidth - kütüphanenin varsayılanı flex:1 kullanıyordu,
    // dar mobil ekranda bu her sütunu eşit/aşırı dar zorlayıp hücre metnini
    // kelime kelime alt alta kırıyor, tablo aşırı uzun bir dikey alan
    // kaplıyordu (canlı testte kullanıcı ekran görüntüsüyle gösterdi,
    // 2026-08-14). minWidth + aşağıdaki yatay ScrollView (bkz. tableRules)
    // ile sütunlar doğal genişliğinde kalır, taşarsa yana kaydırılır - web'in
    // overflow-x-auto çözümüyle aynı ilke.
    th: { minWidth: 110, padding: 5, color: textColor, fontWeight: "700" as const },
    td: { minWidth: 110, padding: 5, color: textColor },
  };
}

// Kütüphanenin varsayılan table render kuralı sadece bir <View> döner (bkz.
// node_modules/.../renderRules.js) - dar mobil ekranda taşan/sıkışan bir
// tablo olduğunda yatay kaydırma imkanı yoktu. Bu override table'ı bir
// yatay ScrollView'a sarıyor (web'deki overflow-x-auto ile aynı ilke).
const tableRenderRules = {
  table: (node: unknown, children: React.ReactNode, _parent: unknown, styles: any) => (
    <ScrollView key={(node as { key: string }).key} horizontal showsHorizontalScrollIndicator>
      <View style={styles._VIEW_SAFE_table}>{children}</View>
    </ScrollView>
  ),
};

// Kullanıcı balonunun rengi artık TEMAYA GÖRE DEĞİŞİYOR (accentSolid: açık
// temada koyu turuncu+beyaz metin, koyu temada parlak turuncu+koyu metin -
// bkz. ui.tsx'teki WCAG kontrast düzeltmesi, 2026-08-15). Bu yüzden
// markdownStyleUser artık modül seviyesinde SABİT değil, ChatTab içinde
// `c.onAccentSolid`e göre useMemo ile hesaplanıyor (bkz. aşağıdaki
// markdownStyleUser tanımı) - asistan balonunun stiliyle aynı desen.

function Avatar({ role, c }: { role: "user" | "assistant"; c: ThemeColors }) {
  const isUser = role === "user";
  return (
    <View
      style={[
        avatarBaseStyle,
        { backgroundColor: isUser ? c.surfaceMuted : `${c.accent}1F` },
      ]}
    >
      {isUser ? <User size={14} color={c.muted} /> : <Bot size={14} color={c.accent} />}
    </View>
  );
}

// Rengden bağımsız (sadece boyut/şekil) - tema değişince yeniden hesaplanmasına
// gerek yok, modül seviyesinde sabit kalabiliyor.
const avatarBaseStyle = StyleSheet.create({
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center" as const, justifyContent: "center" as const },
}).avatar;

export default function ChatTab() {
  const { token, user } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  // getProfile'ı burada AYRICA fetch etmiyoruz - ProfileProvider'ın
  // paylaşımlı cache'inden okuyoruz (2026-08-10 mimari borç raporu, bulgu
  // #7). Bonus: Profil ekranında hedef kaydedilince (useProfile().
  // updateProfile üzerinden) bu değer BURADA da aynı context'ten anında
  // güncellenir - eskiden bunun için ayrı bir useFocusEffect+fetch
  // gerekiyordu, artık paylaşımlı state reaktivitesi yeterli.
  const { profile } = useProfile();
  const needsProfileSetup = profile?.goal === null;
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const markdownStyleAssistant = useMemo(
    () => buildMarkdownStyle(c.text, `${c.text}14`),
    [c.text]
  );
  const markdownStyleUser = useMemo(
    () => buildMarkdownStyle(c.onAccentSolid, `${c.onAccentSolid}33`),
    [c.onAccentSolid]
  );
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayMood, setTodayMoodKey] = useState<MoodKey | null>(null);
  const [dailyTip, setDailyTip] = useState<DailyTip | null>(null);
  const [isTipDismissed, setIsTipDismissed] = useState(false);
  const [movementPct, setMovementPct] = useState<number | null>(null);
  const [nutritionPct, setNutritionPct] = useState<number | null>(null);
  const listRef = useRef<FlatList<DisplayMessage>>(null);

  const greeting = getTimeGreeting(new Date(), language);
  const moodPct = todayMood ? (MOOD_KEYS.indexOf(todayMood) + 1) * 20 : null;

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

  // Tab'lar unmount OLMADIĞI için (bkz. proje belleği) düz useEffect burada
  // sadece İLK mount'ta çalışır - kullanıcı Profil'de mood/hedefini
  // değiştirip Sohbet'e geri dönse bile bu state'ler bayat kalırdı (aynı
  // dosyadaki günlük ipucu banner'ıyla AYNI bug sınıfı, 2026-08-10 pürüz
  // taramasında bulundu). useFocusEffect ile sekmeye HER dönüşte tazeleniyor.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getTodayMood(token)
        .then((mood) => setTodayMoodKey(mood?.mood_key ?? null))
        .catch(() => {});
    }, [token])
  );

  // "Ritim" bileşik skoru için (bkz. RhythmRing) - hareket+beslenme
  // girdileri, mood'un aksine ayrı state'e yazılıyor çünkü mood zaten
  // MoodPicker'ın kendi seçim akışında canlı tutuluyor (onMoodChange).
  // Hareket için özel bir "bugün antrenman var mı" endpoint'i yok - tek
  // günlük aralıkla (days=1) oturum listesi çekilip varlığına bakılıyor,
  // ek backend değişikliği gerekmiyor.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getWorkoutSessions(token, 1, 1)
        .then((sessions) => setMovementPct(sessions.length > 0 ? 100 : 0))
        .catch(() => setMovementPct(null));
      getDailyNutritionSummary(token)
        .then((summary) =>
          setNutritionPct(
            summary.calorie_goal ? Math.min(100, Math.round((summary.total_calories_kcal / summary.calorie_goal) * 100)) : null
          )
        )
        .catch(() => setNutritionPct(null));
    }, [token])
  );

  // Kayıt sonrası profil bilgisi yoksa koç zayıf öneriler veriyor - zorla
  // yönlendirmek yerine boş sohbet ekranında nazik bir davet gösteriliyor
  // (web'deki aynı bilinçli kapsam kararı) - needsProfileSetup artık
  // yukarıda ProfileProvider'dan türetiliyor, ayrı bir fetch/state
  // gerekmiyor.

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
    <SafeAreaView style={s.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={s.topBar}>
          <ThemeToggle />
        </View>

        {isLoadingHistory ? (
          <View style={s.centerFill}>
            <PulseMark size={40} color={c.accent} animated loop />
            <Text style={s.loadingLabel}>{t("Sohbet geçmişi yükleniyor...", "Loading chat history...")}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            // 2026-08-15 (Faz M2b, kullanıcı geri bildirimi): ipucu+ruh hali
            // seçici ÖNCEDEN FlatList'in ÜSTÜNDE sabit duruyordu - konuşma
            // uzayıp aşağı kaydırılınca "sırıtıyor" (yerinde durup mesaj
            // akışından kopuk görünüyor) dedi. Artık FlatList'in KENDİSİNİN
            // başlığı (ListHeaderComponent) - listenin geri kalanıyla birlikte
            // yukarı kayıp gözden kayboluyor, tıpkı bir sohbet uygulamasının
            // en üstteki "sabitlenmemiş" bir duyurusu gibi.
            ListHeaderComponent={
              <>
                {dailyTip && !isTipDismissed ? (
                  <Dismissible onDismiss={() => setIsTipDismissed(true)}>
                    <View style={s.tipBanner}>
                      <Text style={s.tipIcon}>{dailyTip.icon}</Text>
                      <Text style={s.tipText}>
                        <Text style={s.tipCategory}>{dailyTipText(dailyTip, language).category}: </Text>
                        {dailyTipText(dailyTip, language).tip}
                      </Text>
                      <Text style={s.tipSwipeHint}>{t("kaydır", "swipe")}</Text>
                    </View>
                  </Dismissible>
                ) : null}
                <MoodPicker onMoodChange={setTodayMoodKey} />
                <RhythmRing movementPct={movementPct} nutritionPct={nutritionPct} moodPct={moodPct} />
              </>
            }
            ListEmptyComponent={
              <View style={s.emptyState}>
                <View style={s.emptyIconWrap}>
                  <MessageCircle size={26} color={c.accent} />
                </View>
                {user ? (
                  <Text style={s.emptyGreeting}>
                    {greeting}, {nameFromEmail(user.email)}!
                  </Text>
                ) : null}
                <Text style={s.emptySubtext}>{getMoodAwareSubtext(todayMood, language)}</Text>
                {needsProfileSetup ? (
                  <Link href="/profile-settings" style={s.ctaLink}>
                    ✨ {t("Daha kişisel öneriler için hedefini/bilgilerini paylaş", "Share your goals/info for more personal suggestions")}
                  </Link>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  s.messageRow,
                  item.role === "user" ? s.messageRowUser : s.messageRowAssistant,
                ]}
              >
                {item.role === "assistant" ? <Avatar role="assistant" c={c} /> : null}
                <View
                  style={[
                    s.bubble,
                    item.role === "user" ? s.bubbleUser : s.bubbleAssistant,
                  ]}
                >
                  <Markdown
                    markdownit={markdownItInstance}
                    style={item.role === "user" ? markdownStyleUser : markdownStyleAssistant}
                    rules={tableRenderRules}
                  >
                    {item.content}
                  </Markdown>
                </View>
                {item.role === "user" ? <Avatar role="user" c={c} /> : null}
              </View>
            )}
            ListFooterComponent={
              isSending ? (
                <View style={[s.messageRow, s.messageRowAssistant]}>
                  <Avatar role="assistant" c={c} />
                  <View style={[s.bubble, s.bubbleAssistant]}>
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

        <View style={s.inputRow}>
          <QuickAddMenu />
          <FormInput
            value={input}
            onChangeText={setInput}
            placeholder={getMoodAwarePlaceholder(todayMood, language)}
            editable={!isSending}
            style={{ flex: 1 }}
            multiline
          />
          <Pressable
            onPress={handleSubmit}
            disabled={isSending || !input.trim()}
            style={[s.sendButton, (isSending || !input.trim()) && { opacity: 0.5 }]}
          >
            <Send size={18} color={c.onAccentSolid} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.background,
    },
    topBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    tipBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: c.insightBg,
    },
    tipIcon: {
      fontSize: 14,
    },
    tipText: {
      flex: 1,
      fontSize: 12,
      color: c.text,
      lineHeight: 17,
    },
    tipCategory: {
      fontFamily: "Inter_700Bold",
    },
    tipSwipeHint: {
      fontSize: 10,
      color: c.muted,
      alignSelf: "center",
    },
    centerFill: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    loadingLabel: {
      fontSize: 13,
      color: c.muted,
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
      backgroundColor: `${c.accent}1F`,
      alignItems: "center",
      justifyContent: "center",
    },
    // Fraunces SADECE büyük punto (bkz. redesign planı) - karşılama metni bu
    // kuralın mobil karşılığı, web'deki .font-display'in RN eşdeğeri.
    emptyGreeting: {
      fontSize: 20,
      fontFamily: "Fraunces_600SemiBold",
      color: c.text,
    },
    emptySubtext: {
      fontSize: 13,
      color: c.muted,
      textAlign: "center",
      maxWidth: 280,
    },
    ctaLink: {
      marginTop: 4,
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.accent,
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
    bubble: {
      maxWidth: "75%",
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    bubbleUser: {
      backgroundColor: c.accentSolid,
    },
    bubbleAssistant: {
      backgroundColor: c.surfaceMuted,
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
      backgroundColor: c.accentSolid,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
