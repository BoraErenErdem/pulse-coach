import { expect, test, type Page } from "@playwright/test";

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

test("antrenman kaydı oluşturma ve silme", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-workout"), "TestSifre123!");

  await page.getByRole("link", { name: "Antrenman" }).click();
  await expect(page).toHaveURL(/\/workouts$/);

  await page.getByPlaceholder("Egzersiz adı yaz...").fill("Squat");
  await page.waitForTimeout(500); // arama debounce'unun (300ms) tam bitmesini bekle
  // SearchableSelect'in öneri dropdown'ı sadece dışarı tıklamayla kapanıyor
  // (Escape handler'ı yok) - sabit/alakasız bir başlığa tıklamak bunu tetikler.
  await page.getByRole("heading", { name: "Antrenman Kaydet" }).click();
  await page.getByLabel("Tekrar").fill("10");
  await page.getByLabel("Kilo (kg)").fill("60");
  await page.getByRole("button", { name: "Set Ekle" }).click();

  await expect(page.getByText("Squat — 10 tekrar, 60 kg")).toBeVisible();

  await page.getByRole("button", { name: "Oturumu Kaydet" }).click();
  await expect(page.getByText("Antrenman kaydedildi!")).toBeVisible();

  const historyCard = page.locator("h2", { hasText: "Geçmiş Kayıtlar" }).locator("..");
  await expect(historyCard.getByText(/Squat — 10 tekrar, 60 kg/)).toBeVisible();

  await historyCard.getByLabel("Oturumu sil").first().click();
  await expect(historyCard.getByText("Henüz bir antrenman kaydı yok.")).toBeVisible();
});
