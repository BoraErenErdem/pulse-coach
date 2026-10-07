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

test("beslenme hedefleri kaydedilir ve kalıcı olur", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-goals-nutrition"), "TestSifre123!");

  // Hedef Merkezi mobildeki gibi Profil menüsünde (2026-10-07).
  await page.getByRole("link", { name: "Profil" }).click();
  await page.getByRole("link", { name: /^Hedef Merkezi/ }).click();
  await expect(page).toHaveURL(/\/goals$/);

  // Hedef Merkezi mobildeki gibi bir harita (2026-10-07): form "Beslenme" kartının içinde açılır.
  await page.getByRole("button", { name: "Beslenme hedefi belirle" }).click();
  await page.getByLabel("Kalori (kcal)").fill("2200");
  await page.getByLabel("Protein (g)").fill("140");
  await page.locator("form").filter({ has: page.getByLabel("Kalori (kcal)") }).getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Hedefler kaydedildi!")).toBeVisible();
  await expect(page.getByText("0 / 2.200 kcal")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Beslenme hedeflerini düzenle" }).click();
  await expect(page.getByLabel("Kalori (kcal)")).toHaveValue("2200");
  await expect(page.getByLabel("Protein (g)")).toHaveValue("140");
});

test("egzersiz hedefi eklenir ve silinir", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-goals-exercise"), "TestSifre123!");

  // Hedef Merkezi mobildeki gibi Profil menüsünde (2026-10-07).
  await page.getByRole("link", { name: "Profil" }).click();
  await page.getByRole("link", { name: /^Hedef Merkezi/ }).click();
  await expect(page).toHaveURL(/\/goals$/);

  await page.getByRole("button", { name: "Egzersiz hedefi ekle" }).click();
  await page.getByPlaceholder("Egzersiz adı yaz...").fill("Squat");
  await page.waitForTimeout(500);
  // SearchableSelect dropdown'ı sadece dışarı tıklamayla kapanıyor (bkz. workouts.spec.ts notu)
  await page.getByRole("heading", { name: "Egzersiz Hedefi Ekle" }).click();
  await page.getByLabel("Hedef (kg)").fill("100");
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await expect(page.getByText("Hedef eklendi!")).toBeVisible();

  // Hedef satırı Antrenman kartında; dokununca düzenleme açılır, silme iki adımlı (mobil sheet gibi).
  const row = page.getByRole("button", { name: /^Squat/ });
  await expect(row).toBeVisible();
  await row.click();
  await page.getByRole("button", { name: "Hedefi sil" }).click();
  await page.getByRole("button", { name: "Silmeyi onayla" }).click();
  await expect(row).toHaveCount(0);
});

test("haftalık antrenman hedefi kaydedilir, ilerlemesi görünür ve kaldırılır", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-goals-weekly"), "TestSifre123!");

  // Hedef Merkezi mobildeki gibi Profil menüsünde (2026-10-07).
  await page.getByRole("link", { name: "Profil" }).click();
  await page.getByRole("link", { name: /^Hedef Merkezi/ }).click();
  await expect(page).toHaveURL(/\/goals$/);

  await page.getByRole("button", { name: "Haftalık hedef belirle" }).click();
  await page.getByRole("radio", { name: "4" }).click();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Haftalık hedef kaydedildi!")).toBeVisible();
  // Hem satırda ("0/4 gün") hem açık formun ilerlemesinde görünür.
  const weeklyRow = page.getByRole("button", { name: /^Haftalık Antrenman: 0\/4/ });
  await expect(weeklyRow).toBeVisible();

  await page.reload();
  await weeklyRow.click();
  await expect(page.getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Hedefi kaldır" }).click();
  await expect(page.getByText("Haftalık hedef kaldırıldı.")).toBeVisible();
  await expect(weeklyRow).toBeHidden();
  await expect(page.getByText("0/4")).toBeHidden();
});
