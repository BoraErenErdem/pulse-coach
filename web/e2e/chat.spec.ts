import { expect, test, type Page } from "@playwright/test";

/** Bu dosyadaki testler gerçek Ollama'ya ihtiyaç duyar (chat/agent akışı
 * dokunuluyor) — playwright.config.ts'teki genel "Ollama gerekmez" notu
 * SADECE diğer dosyalar için geçerli, çalıştırmadan önce `ollama serve`
 * ayakta olmalı. */

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function registerAndLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Kayıt Ol" }).first().click();
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByLabel("Şifre (tekrar)").fill(password);
  await page.locator("form").getByRole("button", { name: "Kayıt Ol" }).click();
  await expect(page.getByText("Kayıt başarılı")).toBeVisible();

  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/chat$/);
}

test("sohbete mesaj gönderilince gerçek bir yanıt gelir", async ({ page }) => {
  test.setTimeout(90_000);
  await registerAndLogin(page, uniqueEmail("e2e-chat"), "TestSifre123!");

  await page.getByPlaceholder("Bir mesaj yaz...").fill("Merhaba, bana kısaca kim olduğunu anlatır mısın?");
  await page.getByRole("button", { name: "Gönder" }).click();

  const assistantMessages = page.locator('[data-testid="chat-message"][data-role="assistant"]');
  await expect(assistantMessages).toHaveCount(1, { timeout: 60_000 });
  await expect(assistantMessages.last()).not.toHaveText("");
});

test("tek mesajda cok sayida antrenman seti bos veya hatali yanit vermez", async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndLogin(page, uniqueEmail("e2e-chat-bulk"), "TestSifre123!");

  const bulkMessage =
    "Bugun gogus gunu yaptim: bench press 3x10 60kg, incline dumbbell press 3x12 20kg, " +
    "cable fly 3x15 10kg, dips 3x12, triceps pushdown 3x15 25kg, skull crusher 3x12 15kg. " +
    "Ayrica kahvaltida 2 haslanmis yumurta ve 1 dilim tam bugday ekmegi yedim.";

  await page.getByPlaceholder("Bir mesaj yaz...").fill(bulkMessage);
  await page.getByRole("button", { name: "Gönder" }).click();

  const assistantMessages = page.locator('[data-testid="chat-message"][data-role="assistant"]');
  await expect(assistantMessages).toHaveCount(1, { timeout: 90_000 });
  await expect(assistantMessages.last()).not.toHaveText("");
  await expect(page.getByText("Mesaj gönderilemedi")).not.toBeVisible();
});
