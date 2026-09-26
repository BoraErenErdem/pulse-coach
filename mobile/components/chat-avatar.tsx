// Sohbet avatarı (2026-09-26, app/(tabs)/index.tsx'ten taşındı - mantık aynı).
import { StyleSheet, Text, View } from "react-native";
import { User } from "lucide-react-native";
import { PulseMark } from "@/components/ui";
import {
  CHAT_ASSISTANT_TONE_LIGHT,
  CHAT_ASSISTANT_TONE_TEXT_LIGHT,
  CHAT_HEADER_TEXT,
  CHAT_USER_AVATAR_BG,
} from "@/components/chat-identity";

// 2026-08-24 (Profil cilası devamı): kullanıcı balonundaki jenerik `User`
// ikonu, profil sekmesindeki kimlik kartıyla AYNI dilde (baş harf rozeti)
// konuşsun diye `initial`e çevrildi - kullanıcı bulgusu: "mobilde profil
// avatarı yerine kullanıcının isminin baş harfi yazsın". `initial` boşsa
// (ör. `user` henüz auth'tan gelmediyse) eski `User` ikonuna düşülüyor.
// Asistan tarafı da AYNI turda simetrik olarak değişti: jenerik `Bot`
// ikonu yerine markanın KENDİ kimliği (`PulseMark`, nabız motifi) - bu
// motif zaten uygulamanın her yerinde "AI/koç konuşuyor" anlamında
// kullanılıyor (giriş ekranı, sohbet geçmişi yüklenirken, InsightCard
// başlıkları). `animated`/`loop` BİLEREK verilmiyor (ikisi de default
// false) - her mesaj satırında sürekli dönen bir animasyon hem gereksiz
// performans yükü hem de dikkat dağıtıcı olurdu, burada durağan bir rozet
// yeterli.
// Boyut turu (2026-08-24, devam): kullanıcı gerçek cihazda avatardaki
// DURAĞAN PulseMark'ın (16px) hemen yanındaki "yazıyor" balonundaki
// ANİMASYONLU PulseMark'la (TypingIndicator, varsayılan 36px) aynı satırda
// göze çarpan bir büyüklük tutarsızlığı fark etti. İki yerin AYNI 36'ya
// çekilmesi burada mümkün değildi (36'lık bir işaret 28px'lik dairenin
// dışına taşardı) - bunun yerine HER İKİ uç yaklaştırıldı: avatar dairesi
// 28→34'e büyütüldü (içindeki PulseMark/baş harf/User ikonu da orantılı
// büyüdü) VE aşağıdaki TypingIndicator çağrısı kendi `size` prop'uyla
// 36'dan 26'ya küçültüldü (nutrition.tsx'teki fotoğraf analizi kullanımı
// - avatarsız, tek başına bir bağlam - varsayılan 36'da bırakıldı,
// ORADA büyük kalması doğru). Sonuç: 16 vs 36 (2,25x fark) yerine 20 vs
// 26 (1,3x fark) - aynı satırda iki nabız motifi artık aynı "aile"den
// okunuyor, birbirini yutmuyor.
// Kullanıcı avatarı SABİT (gri) - ÖNCEDEN `c.surfaceMuted` kullanıyordu
// (temaya göre değişiyordu), 2026-09-18 turunda sabitlendi. Asistan avatarı
// ARTIK `assistantTone`/`assistantToneText` prop'larıyla ChatTab'dan
// besleniyor (bkz. dosya başındaki CHAT_ASSISTANT_TONE_* notu) - balonuyla
// AYNI renk, temaya göre değişiyor. Prop verilmezse (teorik olarak
// olmamalı, TypingIndicator/mesaj listesi her zaman geçiyor) açık temanın
// tonuna düşülüyor.
export function Avatar({
  role,
  initial,
  assistantBg,
  assistantFg,
}: {
  role: "user" | "assistant";
  initial?: string;
  assistantBg?: string;
  assistantFg?: string;
}) {
  const isUser = role === "user";
  const bg = isUser ? CHAT_USER_AVATAR_BG : (assistantBg ?? CHAT_ASSISTANT_TONE_LIGHT);
  const fg = isUser ? CHAT_HEADER_TEXT : (assistantFg ?? CHAT_ASSISTANT_TONE_TEXT_LIGHT);
  return (
    <View style={[avatarBaseStyle, { backgroundColor: bg }]}>
      {isUser ? (
        initial ? (
          <Text style={[avatarInitialStyle, { color: fg }]}>{initial}</Text>
        ) : (
          <User size={17} color={fg} />
        )
      ) : (
        <PulseMark size={20} color={fg} />
      )}
    </View>
  );
}

export const avatarInitialStyle = { fontSize: 14, fontFamily: "Inter_700Bold" } as const;

// Rengden bağımsız (sadece boyut/şekil) - tema değişince yeniden hesaplanmasına
// gerek yok, modül seviyesinde sabit kalabiliyor.
export const avatarBaseStyle = StyleSheet.create({
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center" as const, justifyContent: "center" as const },
}).avatar;
