import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";

/** `useFocusEffect`'in geciktirilmiş hâli - kullanıcı sekmeler arasında
 * ART ARDA HIZLI dokunduğunda (bir sekmede <180ms kalıp hemen bir sonrakine
 * geçtiğinde) `effect` HİÇ ÇALIŞMIYOR - sadece gerçekten "durulan" bir
 * odaklanma veri yüklemesini/giriş animasyonunu tetikliyor.
 *
 * Kök neden (2026-09-21, kullanıcı Perf Monitor'la doğruladı): sekmeler
 * unmount OLMADIĞI için (bkz. [[feedback-rn-tabs-dont-unmount]]) her sekmenin
 * `useFocusEffect`'i o sekmeye HER dokunuşta hemen ateşleniyordu - kullanıcı
 * sekmeler arasında art arda hızlı geçtiğinde her geçişte YENİ bir ağ isteği
 * + giriş animasyonu (Reveal/sayaç/grafik çizimi) başlıyordu; `freezeOnBlur`
 * (bkz. (tabs)/_layout.tsx) odak DIŞI kalan sekmenin ARKA PLANDA çalışmasını
 * durdurdu ama YENİ odaklanılan her sekmenin kendi ilk ateşlemesini
 * durdurmuyordu - JS FPS hızlı art arda geçişte hâlâ 8'e düşüyordu. Bu hook
 * ilk ateşlemeyi de geciktirip iptal edilebilir yapıyor: sadece kullanıcının
 * GERÇEKTEN görmek istediği (>180ms durduğu) sekme çalışıyor, aradan hızla
 * geçilen sekmeler hiç iş yapmıyor. */
export function useDebouncedFocusEffect(effect: () => void, delay = 180): void {
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(effect, delay);
      return () => clearTimeout(timer);
    }, [effect, delay])
  );
}
