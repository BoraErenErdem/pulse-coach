import { expect, test } from "@playwright/test";

// 2026-08-26 güvenlik denetiminde eklenen fix'lerin regresyon testleri.
// "javascript:" şema filtresi (chat/page.tsx'teki isSafeMarkdownHref) BİLEREK
// burada test edilmiyor - gerçek bir sohbet mesajı gerektiriyor (Ollama
// bağımlılığı, chat.spec.ts'teki gibi), kod incelemesiyle doğrulandı.

test("kimliksiz kullanıcı korumalı bir sayfaya girmeye çalışınca /login'e yönlendirilir", async ({
  page,
}) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login$/);
});

test("korumalı sayfa rotaları (goals, progress) da aynı şekilde login'e yönlendirir", async ({
  page,
}) => {
  await page.goto("/goals");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/progress");
  await expect(page).toHaveURL(/\/login$/);
});

test("response güvenlik header'ları set edilmiş", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("CSP hydration/theme-init script'lerini engellemiyor", async ({ page }) => {
  // Regresyon: CSP'nin script-src'si ÖNCE sha256 hash tabanlıydı ve Next.js'in
  // KENDİ ürettiği hydration inline script'lerini (her build'de farklı hash)
  // engelleyip TÜM client-side JS'i (dolayısıyla auth-context'in /login
  // yönlendirmesini) kırmıştı - bkz. next.config.ts'teki not. Konsolda CSP
  // ihlali olmaması, script-src'nin artık gerçekten çalıştığını doğrular.
  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().toLowerCase().includes("content security policy")) {
      cspViolations.push(msg.text());
    }
  });

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  expect(cspViolations).toEqual([]);
});
