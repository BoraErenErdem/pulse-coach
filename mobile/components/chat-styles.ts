// Sohbet ekranının stilleri (2026-09-26, app/(tabs)/index.tsx'ten taşındı - mantık aynı).
import { StyleSheet } from "react-native";
import type { ThemeColors } from "@/components/ui";
import { getFloatingTabBarClearance } from "@/components/nav-icons";
import { CHAT_HEADER_TEXT, CHAT_USER_BUBBLE } from "@/components/chat-identity";

export function makeStyles(c: ThemeColors, assistantTone: string, insetBottom: number, isKeyboardVisible: boolean) {
  return StyleSheet.create({
    // Tasarım turu (2026-09-19): alt gezinme çubuğu artık yüzen/absolute bir
    // pil (bkz. (tabs)/_layout.tsx) - giriş satırının pilin ALTINDA
    // kalmaması için gereken pay BURADA DEĞİL, `inputRow`'un kendi
    // `paddingBottom`'unda (bkz. oradaki not - web'de flex:1'e eklenen
    // padding sayfayı taşırıyordu).
    safe: {
      flex: 1,
      backgroundColor: c.background,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    // Tarih çipi + Ritim rozeti BİRLİKTE tek bir sol grup (2026-09-18
    // tasarım turu) - `flexShrink` sayesinde dar ekranlarda tarih metni
    // (bkz. dateChipText numberOfLines) küçülüyor, rozet HER ZAMAN sabit
    // boyutunu koruyor, `topBarRight` (tema/menü) ekran dışına itilmiyor.
    topBarLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 1,
      marginRight: 8,
    },
    topBarRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    iconButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    // Dolgulu tarih çipi - tasarım turu (2026-09-18): ÖNCEDEN nötr bir
    // accent-tonlu ÇERÇEVE'ydi (`${c.accent}1F` dolgu), arkadaşın chat
    // mockup'ı tam dolgulu, koyu/açık temada FARKLI iki ton (`chatHeaderBg`,
    // JSX'te geçiliyor) + ince accent çerçeve kullanıyor.
    dateChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1.5,
    },
    dateChipText: {
      flexShrink: 1,
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: CHAT_HEADER_TEXT,
    },
    // Bileşik "Ritim" yüzdesi - ÖNCEDEN tarih çipinin İÇİNDE minyatür bir
    // halkaydı, artık kendi dairesel rozeti (bkz. JSX'teki MiniRhythmRing
    // notu). Boyut tarih çipiyle AYNI yüksekliğe (~44) oturacak şekilde.
    rhythmBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
    },
    // Bugünün ipucu henüz kapatılmadıysa küçük bir nokta - "Bugün"
    // sohbet listesinden çıkınca (bkz. dosya başı not) kaybolan eski
    // keşfedilebilirliğin yerine geçen minimal bir sinyal.
    todayChipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: CHAT_HEADER_TEXT,
    },
    // "Bugün" panelinin dış çerçevesi - üst bardan hemen sonra geliyor,
    // kendi kenar boşluğu var (görsel kart `todayPanelCard`'da, bkz. aşağı).
    todayPanel: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    // Tasarım turu (2026-09-19): mood seçici+cümle+sağlık notu+Ritim
    // halkasını SARAN TEK kart - mockup'ın "hepsi bir arada" hissi.
    // Koyu modda JSX'te bunun yerine `LinearGradient` kullanılıyor (bkz.
    // oradaki not), bu stil SADECE dolgu/kenarlık DIŞINDAKİ ortak
    // özellikleri taşıyor (radius/padding/gap) - `backgroundColor` açık
    // mod çağrısında JSX'te ayrıca ekleniyor.
    todayPanelCard: {
      borderRadius: 20,
      padding: 16,
      gap: 12,
      overflow: "hidden",
    },
    // ImageBackground'un iç görseli kartın köşe yarıçapını KENDİ kesmez.
    todayPanelCardImage: {
      borderRadius: 20,
    },
    // Panel açıkken mesaj listesinin üstüne binen karartma - bkz.
    // todayScrimStyle notu. Renk BottomSheet'in backdrop'uyla AYNI
    // (`#000000A6`'nın daha HAFİF bir versiyonu, opaklık zaten
    // `panelProgress*0.4` ile ayrıca sınırlanıyor) - temadan bağımsız sabit
    // siyah, bir "karartma katmanı" her iki temada da böyle okunur.
    todayScrim: {
      backgroundColor: "#000000",
    },
    // "💚 Sağlık Notu" - bkz. renderHealthNote notu. Panelin KENDİ zemini
    // zaten dolgulu olduğu için (todayPanelCard) burada AYRI bir arka plan/
    // kenarlık YOK, sadece üstteki ince çizgi encouragement metninden
    // ayırıyor (tipInline'ın eski deseniyle AYNI ilke).
    healthNote: {
      gap: 4,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: `${c.text}1F`,
    },
    healthNoteHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    healthNoteIcon: {
      fontSize: 14,
    },
    healthNoteTitle: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
    healthNoteText: {
      fontSize: 13,
      color: c.text,
      lineHeight: 19,
    },
    // Ritim halkası artık panelin KENDİ zemininde oturuyor (RhythmRing'in
    // eski kendi kart dolgusu kaldırıldı, bkz. rhythm-ring.tsx notu) -
    // sadece bir üst çizgiyle sağlık notundan ayrılıyor.
    todayRhythmRow: {
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: `${c.text}1F`,
    },
    // Bkz. yukarıdaki JSX notu - InsightCard'ın AYNI görsel dili
    // (insightBg/insightAccent) ödünç alındı, tam bileşen değil (title
    // gerektiriyor, burada gereksiz). Tasarım turu (2026-09-19): panelin
    // KENDİSİ artık kart olduğu için bu satırın KENDİ ayrı dolgu/arka
    // planı KALDIRILDI (çifte-kart görünümü mockup'ta yok) - sadece
    // ikon+metin satırı kaldı.
    todayEncouragementCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    todayEncouragementIcon: {
      fontSize: 13,
      lineHeight: 18,
    },
    todayEncouragement: {
      flex: 1,
      fontSize: 13,
      color: c.text,
      lineHeight: 18,
    },
    // Konuşma en altta değilken beliren "aşağı in" oku (kullanıcı isteği,
    // 2026-08-17) - input satırının hemen üzerinde, sağ kenar hizasında.
    scrollToBottomButton: {
      position: "absolute",
      right: 16,
      bottom: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accentSolid,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: c.text },
    manageHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    manageHeaderIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${c.accent}1F`,
      borderWidth: 1,
      borderColor: "transparent",
    },
    // Her eylem (Sıfırla/Kalıcı Sil) artık KENDİ kartında - üst bardaki
    // todayEncouragementCard ile AYNI dolgu+yuvarlak köşe dili (2026-09-19).
    // Tasarım turu (2026-09-21): kartlara hafif bir gölge eklendi (diğer
    // panellerle AYNI "yüzeyin üstünde yükseliyor" hissi) - önceden düz
    // kenarlıktan başka derinliği yoktu.
    manageCard: {
      gap: 8,
      padding: 14,
      borderRadius: 16,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    // Dark tema cilası (2026-09-22): `c.surfaceMuted`/`c.border` koyu temada
    // birbirine çok yakın (#232D31/#2C383C) - kart sheet zemininden neredeyse
    // ayrışmıyordu. Diğer sayfaların kurulu dili (beyaz-alfa kenarlık + hafif
    // beyaz overlay) burada da AYNI ilkeyle uygulanıyor.
    manageCardDark: {
      backgroundColor: "rgba(255,255,255,0.05)",
      borderColor: "rgba(255,255,255,0.14)",
    },
    // Tehlikeli eylem: kenarlık ÖNCEDEN de kırmızıydı ama zemin diğer
    // kartla AYNIYDI - artık hafif kırmızı bir yıkamayla (sadece kenarlıkla
    // değil, zeminle de) "buraya dikkat et" hissi güçleniyor.
    manageCardDanger: {
      backgroundColor: `${c.error}12`,
      borderColor: `${c.error}33`,
    },
    // Aynı tehlike vurgusu, dark cilanın (manageCardDark) beyaz-alfa overlay'i
    // ÜSTÜNE binerse kırmızı boğulurdu - dark'ta kırmızı washı biraz daha
    // güçlü (2E/70 hap formülüne yakın, bkz. tasarım dili §2).
    manageCardDangerDark: {
      backgroundColor: `${c.error}1F`,
      borderColor: `${c.error}70`,
    },
    manageCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    manageIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "transparent",
    },
    manageRowTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: c.text },
    manageRowDesc: { fontSize: 12, color: c.muted, lineHeight: 17 },
    manageConfirmRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    // Dolgu JSX'te (Bugün paneliyle aynı gradyan/görsel, bkz. renderTipBanner).
    tipBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      overflow: "hidden",
    },
    // ImageBackground'un iç görseli kartın köşe yarıçapını KENDİ kesmez.
    tipBannerImage: {
      borderRadius: 18,
    },
    tipIcon: {
      fontSize: 14,
    },
    tipText: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: c.text,
      lineHeight: 18,
    },
    tipCategory: {
      fontFamily: "Inter_700Bold",
    },
    tipSwipeHint: {
      fontSize: 11,
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
    emptyNudge: {
      width: "100%",
      marginTop: 12,
      gap: 4,
    },
    // alignItems önceden "flex-end" idi - tek satırlık mesajlarda sorun
    // yaratmıyordu ama koçun çok satırlı (3-4 satır) cevaplarında 🤖
    // avatarı SON satırın hizasına düşüyordu, "kim konuşuyor" ipucu ilk
    // satırdan kopuk görünüyordu (2026-08-21 tasarım denetimi, Sohbet
    // yerleşimi turu). "flex-start" avatarı balonun İLK satırıyla
    // hizalar - WhatsApp/Telegram/iMessage'daki standart desen.
    messageRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    messageRowUser: {
      justifyContent: "flex-end",
    },
    messageRowAssistant: {
      justifyContent: "flex-start",
    },
    // Tasarım turu (2026-09-18): balon köşe yarıçapı 16'dan 20'ye çıkarıldı
    // (arkadaşın chat mockup'ındaki daha "pilli" görünüm). Kullanıcı balonu
    // SABİT (CHAT_USER_BUBBLE), asistan balonu `assistantTone` parametresi
    // üzerinden TEMAYA GÖRE değişiyor (bkz. dosya başındaki
    // CHAT_ASSISTANT_TONE_* notu, 2026-09-19).
    bubble: {
      maxWidth: "75%",
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleUser: {
      backgroundColor: CHAT_USER_BUBBLE,
    },
    bubbleAssistant: {
      backgroundColor: assistantTone,
    },
    // Akışlı yanıt (2026-09-26): yazıyor göstergesi + araç durumu yan yana.
    typingRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
    toolStatus: { fontSize: 13, flexShrink: 1 },
    // `paddingBottom` (`safe`'e DEĞİL, buraya) giriş satırının pilin
    // ALTINDA kalmamasını sağlıyor - `safe`'e eklemek web'de TÜM sayfanın
    // (flex:1 zincirinin) viewport'tan taşmasına yol açıyordu (kök neden:
    // web'de flex:1'e eklenen fazladan padding, aradaki FlatList'in
    // ESNEMESİ yerine kök konteynerin GERÇEK YÜKSEKLİĞİNİ artırıyor -
    // native'de flex:1 çocukları taşmaz ama web'de bu garanti YOK).
    // `inputRow` flex:1 DEĞİL (sabit yükseklikli bir satır) - fazladan
    // padding'i FlatList'in (flex:1, aradaki) esnek alanından "çalıyor",
    // kök konteyneri BÜYÜTMÜYOR.
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: isKeyboardVisible ? 10 : 16 + getFloatingTabBarClearance(insetBottom),
    },
    // Mesaj kutusu artık tam pil şekli (radius 22, ÖNCEDEN FormInput'un
    // paylaşımlı kutu köşesi 10'du - burada SADECE bu ekrana özel bir
    // override, FormInput'un kendi varsayılanı diğer tüm formlarda
    // DEĞİŞMEDİ, bkz. JSX'teki inline style).
    chatInput: {
      borderRadius: 22,
      borderColor: `${c.accent}40`,
    },
    // Gönder düğmesi - ÖNCEDEN dolu `accentSolid` daire, tasarım turu
    // (2026-09-18): hafif turuncu-tonlu dolgu + belirgin turuncu çerçeve
    // (mockup'ın dark'taki outline / light'taki açık dolgu halini TEK bir
    // ara tonla her iki temada da karşılayan pragmatik seçim).
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: `${CHAT_USER_BUBBLE}1F`,
      borderWidth: 1.5,
      borderColor: CHAT_USER_BUBBLE,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
