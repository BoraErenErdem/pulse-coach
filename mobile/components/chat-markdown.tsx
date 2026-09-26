// Koç yanıtlarının Markdown görünümü (2026-09-26, app/(tabs)/index.tsx'ten
// taşındı - mantık aynı). Sohbet taslağı ve mesaj balonları aynı stili kullanır.
import type React from "react";
import { ScrollView, View } from "react-native";
import { MarkdownIt } from "react-native-markdown-display";

// Koç (LLM) cevapları markdown üretiyor (**kalın**, numaralı listeler vb.)
// ama eskiden {item.content} düz <Text> içine basılıyordu - kullanıcı
// ekranda yıldızları görüyordu (2026-08-14, kullanıcı canlı sohbette
// yakaladı). breaks:true tek satır sonlarını da satır kırılımı yapıyor ki
// eski görünümle tutarlı kalsın. Instance modül seviyesinde - her render'da
// yeniden oluşturulmasın.
export const markdownItInstance = MarkdownIt({ typographer: true, breaks: true });

// 2026-08-30 güvenlik denetimi: web tarafı (chat/page.tsx) 2026-08-26'da
// `javascript:`/`data:` gibi güvensiz şemalı markdown linklerine karşı bir
// filtre almıştı, mobil aynı LLM çıktısını render eden karşılık gelen ekran
// atlanmıştı (parite eksikliği). react-native-markdown-display'in
// `onLinkPress` prop'u `true` dönerse linki kendisi `Linking.openURL` ile
// açıyor - `false` dönmek açmayı ENGELLIYOR (bkz. node_modules/
// react-native-markdown-display/src/lib/util/openUrl.js).
export const _SAFE_HREF_SCHEMES = /^(https?:|mailto:)/i;
export function isSafeMarkdownHref(href: string): boolean {
  if (!href) return false;
  if (!href.includes(":")) return true; // şema içermeyen (göreli) link
  return _SAFE_HREF_SCHEMES.test(href);
}

export function buildMarkdownStyle(textColor: string, codeBackground: string) {
  // react-native-markdown-display'in heading1-6/hr varsayılanları (bkz.
  // node_modules/.../styles.js) renk TANIMLAMIYOR (heading'ler) ya da SABİT
  // siyah kullanıyor (hr) - koç artık uzun/detaylı cevaplarda "### Başlık"
  // üretebildiği için (bkz. backend MAX_REPLY_SENTENCES_DETAILED, 2026-08-14)
  // bunlara textColor'a bağlı EXPLICIT stil vermek gerekiyor, yoksa karanlık
  // modda ya da user balonunda (beyaz metin) başlık/ayraç görünmez kalabilirdi.
  const heading = { color: textColor, fontFamily: "Inter_700Bold", marginTop: 6, marginBottom: 4 };
  return {
    body: { fontSize: 14, color: textColor },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { fontFamily: "Inter_700Bold" },
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
    th: { minWidth: 110, padding: 5, color: textColor, fontFamily: "Inter_700Bold" },
    td: { minWidth: 110, padding: 5, color: textColor },
  };
}

// Kütüphanenin varsayılan table render kuralı sadece bir <View> döner (bkz.
// node_modules/.../renderRules.js) - dar mobil ekranda taşan/sıkışan bir
// tablo olduğunda yatay kaydırma imkanı yoktu. Bu override table'ı bir
// yatay ScrollView'a sarıyor (web'deki overflow-x-auto ile aynı ilke).
export const tableRenderRules = {
  table: (node: unknown, children: React.ReactNode, _parent: unknown, styles: any) => (
    <ScrollView key={(node as { key: string }).key} horizontal showsHorizontalScrollIndicator>
      <View style={styles._VIEW_SAFE_table}>{children}</View>
    </ScrollView>
  ),
};

// Kullanıcı balonu dolgusu SABİT (bkz. dosya başındaki CHAT_USER_BUBBLE
// notu) - bu yüzden içindeki markdown metin rengi de modül seviyesinde
// SABİT. Asistan tarafı ARTIK TEMAYA GÖRE DEĞİŞTİĞİ için (bkz.
// CHAT_ASSISTANT_TONE_* notu) markdownStyleAssistant ChatTab İÇİNDE,
// `assistantToneText`e göre useMemo ile hesaplanıyor (bkz. aşağısı).
export const markdownStyleUser = buildMarkdownStyle("#FFFFFF", "#FFFFFF33");
