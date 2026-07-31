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
