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
  await page.locator("form").getByRole("button", { name: "Kayıt Ol" }).click();

  await expect(page.getByText("Kayıt başarılı")).toBeVisible();

  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Giriş Yap" }).click();

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Çıkış Yap" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("kısa şifreyle kayıt reddedilir", async ({ page }) => {
  const email = uniqueEmail("e2e-shortpass");

  await page.goto("/login");
  await page.getByRole("button", { name: "Kayıt Ol" }).first().click();
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill("kisa1");
  await page.getByLabel("Şifre (tekrar)").fill("kisa1");
  await page.locator("form").getByRole("button", { name: "Kayıt Ol" }).click();

  // HTML5 minLength=8 validasyonu tarayıcıda formu hiç göndermemeli
  await expect(page.getByText("Kayıt başarılı")).not.toBeVisible();
});
