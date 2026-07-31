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

test("beslenme hedefleri kaydedilir ve kalıcı olur", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-goals-nutrition"), "TestSifre123!");

  await page.getByRole("link", { name: "Hedefler" }).click();
  await expect(page).toHaveURL(/\/goals$/);

  await page.getByLabel("Kalori (kcal)").fill("2200");
  await page.getByLabel("Protein (g)").fill("140");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Hedefler kaydedildi!")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Kalori (kcal)")).toHaveValue("2200");
  await expect(page.getByLabel("Protein (g)")).toHaveValue("140");
});

test("egzersiz hedefi eklenir ve silinir", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-goals-exercise"), "TestSifre123!");

  await page.getByRole("link", { name: "Hedefler" }).click();
  await expect(page).toHaveURL(/\/goals$/);

  await page.getByPlaceholder("Egzersiz adı yaz...").fill("Squat");
  await page.waitForTimeout(500);
  // SearchableSelect dropdown'ı sadece dışarı tıklamayla kapanıyor (bkz. workouts.spec.ts notu)
  await page.getByRole("heading", { name: "Egzersiz Hedefleri" }).click();
  await page.getByLabel("Hedef (kg)").fill("100");
  await page.getByRole("button", { name: "Ekle" }).click();

  await expect(page.getByText("Squat")).toBeVisible();

  await page.getByLabel("Hedefi sil").click();
  await expect(page.getByText("Henüz bir egzersiz hedefi yok.")).toBeVisible();
});
