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

test("ilerleme kaydı (kilo + antrenman) kaydedilir ve özet güncellenir", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("e2e-progress"), "TestSifre123!");

  await page.getByRole("link", { name: "İlerleme" }).click();
  await expect(page).toHaveURL(/\/progress$/);

  await page.getByText("Henüz bu hafta bir kayıt yok").waitFor();

  await page.getByLabel("Kilo girmek istiyorum").check();
  await page.getByLabel("Kilo (kg)").fill("72");
  await page.getByLabel("Bugün antrenman yaptım").check();
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.getByText("Kaydedildi!")).toBeVisible();
  await expect(page.getByText("72 kg")).toBeVisible();
  await expect(page.getByText("Henüz bu hafta bir kayıt yok")).not.toBeVisible();

  await expect(page.getByRole("heading", { name: "Kilo Trendi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Antrenman Türü Dağılımı" })).toBeVisible();
});
