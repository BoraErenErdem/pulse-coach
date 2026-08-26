import { defineConfig, devices } from "@playwright/test";

/** Gerçek backend'e karşı çalışır (mock yok) - proje felsefesiyle tutarlı,
 * bkz. backend'in kendi entegrasyon test yaklaşımı. Testleri çalıştırmadan
 * önce backend'in (`uvicorn`) ayrı bir terminalde ayakta olması gerekir.
 * `e2e/chat.spec.ts` gerçek sohbet akışına dokunduğu için ayrıca `ollama
 * serve`'ün de ayakta olması gerekir; diğer dosyalar Ollama gerektirmez. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Uygulama navigator.language'a göre TR/EN varsayılan seçiyor (bkz.
    // lib/language-context.tsx::detectBrowserLanguage) - Playwright'ın
    // Chromium'u locale VERİLMEZSE varsayılan olarak en-US kullanıyor,
    // bu da testlerin (hepsi Türkçe metin arıyor, ör. "Kayıt Ol") kayıt/
    // giriş formunda İngilizce render ile karşılaşıp E-posta alanını hiç
    // bulamamasına yol açıyordu (2026-08-26 güvenlik denetiminde 15 testte
    // yakalandı - uygulama davranışı DOĞRU, test ortamı yanlış locale'de
    // koşuyordu). tr-TR, uygulamanın kendi varsayılan dili ve testlerin
    // yazıldığı dille eşleşiyor.
    locale: "tr-TR",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
