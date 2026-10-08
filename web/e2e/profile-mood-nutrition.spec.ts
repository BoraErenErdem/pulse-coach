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
  // Kayıttan sonra otomatik giriş (2026-10-06) - elle giriş adımı yok.
  await expect(page).toHaveURL(/\/chat$/);
}

test("hesap ayarları görünen adı kaydeder ve kalıcı olur", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-profile"), "TestSifre123!");

  await page.getByRole("link", { name: "Profil" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  // Bilgiler mobildeki gibi ayrı "Hesap ve Ayarlar" ekranında (2026-10-07).
  await page.getByRole("link", { name: /^Hesap ve Ayarlar/ }).click();
  await expect(page).toHaveURL(/\/profile\/settings$/);

  // Mobildeki gibi bölümler (2026-10-08): metin değişince "Vazgeç / Kaydet" çıkar; hedef kilo
  // artık Hedef Merkezi'nde.
  await page.getByLabel("Görünen Ad").fill("Deneme Kişi");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("Kaydedildi!")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Görünen Ad")).toHaveValue("Deneme Kişi");

  // Çipler anında kaydedilir.
  await page.getByRole("radio", { name: "Kas yapmak" }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Kas yapmak" })).toHaveAttribute("aria-checked", "true");
});

test("ruh hali sayfası boşken doğru mesajı gösterir", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-mood"), "TestSifre123!");

  // Ruh Hali mobildeki gibi Profil menüsünde (2026-10-07).
  await page.getByRole("link", { name: "Profil" }).click();
  await page.getByRole("link", { name: /^Ruh Hali/ }).click();
  await expect(page).toHaveURL(/\/mood$/);
  await expect(page.getByText(/Henüz ruh hali kaydı yok/).first()).toBeVisible();
});

test("sohbette seçilen ruh hali, ruh hali geçmişinde görünür", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-mood-data"), "TestSifre123!");

  // MoodPicker sohbet sayfasının üstünde, aria-label seçenek etiketiyle aynı
  await page.getByRole("button", { name: "İyi", exact: true }).click();
  await page.waitForTimeout(500);

  // Ruh Hali mobildeki gibi Profil menüsünde (2026-10-07).
  await page.getByRole("link", { name: "Profil" }).click();
  await page.getByRole("link", { name: /^Ruh Hali/ }).click();
  await expect(page).toHaveURL(/\/mood$/);

  // /mood sayfası takvim/emoji-grid görünümü kullanıyor (bkz. mood/page.tsx) -
  // mod etiketi düz metin olarak DEĞİL, hücrenin title özelliğinde ("27
  // Ağustos: İyi") ve emoji olarak render ediliyor.
  await expect(page.getByText("Henüz ruh hali kaydı yok")).not.toBeVisible();
  await expect(page.locator('[title*="İyi"]')).toBeVisible();
});

test("öğün kaydı miktar güncelleme ve silme", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-nutrition"), "TestSifre123!");

  await page.getByRole("link", { name: "Beslenme" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);

  // Form mobildeki gibi katlı "+ Öğün Kaydet" çubuğu (2026-10-07): önce aç.
  await page.getByRole("button", { name: "Öğün Kaydet" }).click();
  await page.getByPlaceholder("Besin adı yaz...").fill("tavuk");
  await page.waitForTimeout(500); // arama debounce'u (300ms)
  // Öneriler ARIA listbox seçenekleri (2026-10-06).
  const firstResult = page.getByRole("option", { name: /tavuk/i }).first();
  await firstResult.click();
  await page.getByLabel("Miktar (g)").fill("150");
  await page.getByRole("button", { name: "Öğüne Ekle" }).click();
  await expect(page.getByText("Öğün kaydedildi!")).toBeVisible();

  // Bugünün kayıtları mobildeki gibi "Bugünkü Öğünler" kartında (Geçmiş = önceki günler, 2026-10-08).
  const todayCard = page.locator("h2", { hasText: "Bugünkü Öğünler" }).locator("..");
  await expect(todayCard.getByText(/150 g/)).toBeVisible();

  await todayCard.getByLabel(/miktarını düzenle/).click();
  await todayCard.locator('input[type="number"]').fill("300");
  await todayCard.getByLabel("Kaydet").click();
  await expect(todayCard.getByText(/300 g/)).toBeVisible();

  await todayCard.getByLabel("Kaydı sil").click();
  await expect(todayCard.getByText("Henüz kayıt yok")).toHaveCount(4);
});
