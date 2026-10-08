import { expect, test } from "@playwright/test";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test("kayıt ol, giriş yap ve çıkış yap", async ({ page }) => {
  const email = uniqueEmail("e2e-auth");
  const password = "TestSifre123!";

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

  // Kayıttan sonra otomatik giriş (2026-10-06) - elle giriş adımı yok.

  await expect(page).toHaveURL(/\/chat$/);
  // E-posta mobildeki gibi Hesap ve Ayarlar başlığının altında (2026-10-08).
  await page.getByRole("link", { name: "Profil" }).click();
  await page.getByRole("link", { name: /^Hesap ve Ayarlar/ }).click();
  await expect(page.getByText(email)).toBeVisible();

  // Üst çubukta ve Ayarlar > Uygulama'da çıkış var.
  await page.getByRole("button", { name: "Çıkış Yap" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("kısa şifreyle kayıt reddedilir", async ({ page }) => {
  const email = uniqueEmail("e2e-shortpass");

  await page.goto("/login");
  await page.getByRole("button", { name: "Kayıt Ol" }).first().click();
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill("kisa1");
  await page.getByLabel("Şifre (tekrar)").fill("kisa1");
  // KVKK + Kullanim Kosullari: register butonu uc ayri riza kutusu
  // isaretlenmeden disabled kaliyor (bkz. src/app/login/page.tsx) - e2e'de
  // gercek kullanici akisini taklit etmek icin ucunu de isaretliyoruz.
  await page.locator("#kvkkConsent").check();
  await page.locator("#healthDataConsent").check();
  await page.locator("#termsConsent").check();
  await page.locator("form").getByRole("button", { name: "Kayıt Ol" }).click();

  // HTML5 minLength=8 validasyonu tarayıcıda formu hiç göndermemeli
  // Kayıt başarılı olsaydı otomatik giriş /chat'e götürürdü (2026-10-06).
  await expect(page).toHaveURL(/\/login$/);
});
