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

test("profil sayfası hedef kiloyu kaydeder ve kalıcı olur", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-profile"), "TestSifre123!");

  await page.getByRole("link", { name: "Profil" }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.getByLabel("Hedef Kilo (kg)").fill("75");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Profil kaydedildi!")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Hedef Kilo (kg)")).toHaveValue("75");
});

test("ruh hali sayfası boşken doğru mesajı gösterir", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-mood"), "TestSifre123!");

  await page.getByRole("link", { name: "Ruh Hali" }).click();
  await expect(page).toHaveURL(/\/mood$/);
  await expect(page.getByText(/Henüz ruh hali kaydı yok/).first()).toBeVisible();
});

test("öğün kaydı miktar güncelleme ve silme", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-nutrition"), "TestSifre123!");

  await page.getByRole("link", { name: "Beslenme" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);

  await page.getByPlaceholder("Besin adı yaz...").fill("tavuk");
  await page.waitForTimeout(500); // arama debounce'u (300ms)
  const firstResult = page.locator("button", { hasText: /tavuk|Tavuk/ }).first();
  await firstResult.click();
  await page.getByLabel("Miktar (g)").fill("150");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Öğün kaydedildi!")).toBeVisible();

  const historyCard = page.locator("h2", { hasText: "Geçmiş Kayıtlar" }).locator("..");
  await expect(historyCard.getByText(/150 g/)).toBeVisible();

  await historyCard.getByLabel("Kaydı düzenle").click();
  await historyCard.locator('input[type="number"]').fill("300");
  await historyCard.getByLabel("Kaydet").click();
  await expect(historyCard.getByText(/300 g/)).toBeVisible();

  await historyCard.getByLabel("Kaydı sil").click();
  await expect(historyCard.getByText("Henüz bir öğün kaydı yok.")).toBeVisible();
});
