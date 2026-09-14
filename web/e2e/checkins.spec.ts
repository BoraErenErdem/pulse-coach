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
  // KVKK + Kullanim Kosullari: register butonu uc ayri riza kutusu
  // isaretlenmeden disabled kaliyor (bkz. src/app/login/page.tsx) - e2e'de
  // gercek kullanici akisini taklit etmek icin ucunu de isaretliyoruz.
  await page.locator("#kvkkConsent").check();
  await page.locator("#healthDataConsent").check();
  await page.locator("#termsConsent").check();
  await page.locator("form").getByRole("button", { name: "Kayıt Ol" }).click();
  await expect(page.getByText("Kayıt başarılı")).toBeVisible();

  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/chat$/);
}

test("check-in sayfası yeni kullanıcı için hatasız boş durum gösterir", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-checkins"), "TestSifre123!");

  await page.getByRole("link", { name: "Bildirimler" }).click();
  await expect(page).toHaveURL(/\/checkins$/);

  await expect(page.getByText(/Henüz bir bildirimin yok/)).toBeVisible();
});
