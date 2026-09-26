// Sohbet ekranının renk kimliği (2026-09-26, app/(tabs)/index.tsx'ten taşındı -
// değerler aynı; diğer *-identity.ts dosyalarıyla aynı düzen).
// Sohbet balonu/avatar/üst bar rozeti renkleri - arkadaşın gönderdiği chat
// tasarımı (2026-09-18, "pulsecoach pngler/chat"). Kullanıcı tarafı
// (balon+avatar) her iki tema ekran görüntüsünde de (piksel örneklemesiyle
// doğrulandı) AYNI hex değerlerini kullanıyor - bilinçli, temadan BAĞIMSIZ
// SABİT bir marka rengi.
// Açık mod arkaplanı YİNE DE uygulamanın kendi düz krem rengine sabit
// kalıyor (kullanıcı talimatı) - bu sabitler SADECE balon/avatar/rozet
// içindir, sayfa zemini `c.background`'dan hiç etkilenmiyor.
export const CHAT_USER_BUBBLE = "#FF5A1F";
export const CHAT_USER_AVATAR_BG = "#525252";
export const CHAT_HEADER_TEXT = "#F5F3EE";
// Asistan tarafı (balon+avatar arka planı+"düşünüyor" nabız animasyonu)
// ÖNCEDEN kullanıcı tarafıyla AYNI mantıkla sabit tek bir peach'ti - ama
// avatar arka planı (CHAT_AVATAR_BG, gri) balonun peach rengiyle hiç
// eşleşmiyordu, kullanıcı bunu "üçü de aynı renk olsun" diye bulguladı
// (2026-09-19). Artık üçü (balon dolgusu, asistan avatar dolgusu,
// TypingIndicator'ın rengi) TEK bir "assistantTone" çiftinden geliyor -
// açık temada ESKİ (beğenilen) peach korunuyor, koyu temada aynı peach'in
// düşük parlaklıklı/aynı ton ailesindeki karşılığı (HSL'de hue korunarak
// l/s düşürülerek türetildi) kullanılıyor - bkz. ChatTab içindeki
// `assistantTone`/`assistantToneText` hesaplaması.
export const CHAT_ASSISTANT_TONE_LIGHT = "#FFCDBB";
export const CHAT_ASSISTANT_TONE_DARK = "#382219";
export const CHAT_ASSISTANT_TONE_TEXT_LIGHT = "#241D14";
export const CHAT_ASSISTANT_TONE_TEXT_DARK = "#F5F3EE";
// Üst bardaki tarih çipi + Ritim rozetinin dolgusu - SABİT değil, tasarımın
// kendisi koyu/açık temada FARKLI iki ton kullanıyor (koyu: bir maroon/
// kahve, açık: canlı mercan) - bkz. dosyanın en altındaki chatHeaderBg
// hesaplaması.
export const CHAT_HEADER_BG_DARK = "#3B1F15";
export const CHAT_HEADER_BG_LIGHT = "#FD8D64";
// Açık modda "Bugün" panelinin arka planı (kullanıcı talimatı 2026-09-19:
// sayfa zemini düz krem kalır, SADECE bu panel mockup'taki beyaz+turuncu
// parıltı zeminini taşır). Klasörde ayrı bir arka plan dosyası yok, mockup
// (bilgilendirmeekranı/light) üzerinden yazılar/ikonlar temizlenerek
// üretildi. Renk yükleme anında/görsel şeffaf kalırsa görünür taban rengi.
export const TODAY_PANEL_BG_LIGHT = require("@/assets/images/today-panel-light.png");
export const TODAY_PANEL_BG_LIGHT_BASE = "#F8F8F8";
