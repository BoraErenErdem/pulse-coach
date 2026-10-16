// Mağaza görsellerinin ham ekranlarını uygulamanın Expo web önizlemesinden çeker
// -> raw/<tema>/<dil>/<id>.png (414x896 pt, 3x = 1242x2688; iPhone 11 ile aynı oran).
//
// Gerekenler: backend (8000) + `npx expo start` (8081) + Ollama (fotoğraf analizi gemma4:12b).
// Hesaplar: store-tr@ / store-en@pulsecoachapp.com - backend/ dizininden
//   DEMO_ACCOUNT_PASSWORD=<şifre> python -m scripts.create_demo_account --email store-tr@pulsecoachapp.com --language tr --reset
// (en için de aynısı), sonra görünen ad "Elif" ve sohbet ekranındaki mesaj (bkz. app-store-listing.md).
// Kullanım (repo kökünden): STORE_PASSWORD=<şifre> node mobile/store/screenshots/capture.mjs [--only chat] [--lang tr] [--theme dark]
// İş bitince iki hesap silinir (Profil > Hesabımı Sil ya da DB'den).
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const require = createRequire(join(repo, "web", "package.json"));
const { chromium } = require("playwright");

const APP = "http://localhost:8081";
const API = (() => {
  const env = readFileSync(join(repo, "mobile", ".env"), "utf8").match(/^EXPO_PUBLIC_API_BASE_URL=(.+)$/m);
  return env ? env[1].trim() : "http://localhost:8000";
})();
const PASSWORD = process.env.STORE_PASSWORD;
if (!PASSWORD) throw new Error("STORE_PASSWORD gerekli");
const MEAL_PHOTO = join(repo, ".playwright-mcp", "meal.jpg");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};

const tr = (lang, a, b) => (lang === "tr" ? a : b);

// Her ekran: adres + "hazır" sayılacağı metin. Fotoğraf ekranı ayrıca analiz akışını yürütür.
const SCREENS = {
  chat: { path: "/", ready: (l) => tr(l, "Nasıl gidiyorum?", "How am I doing?") },
  photo: { path: "/nutrition", ready: (l) => tr(l, "Bugünkü Öğünler", "Today's Meals") },
  nutrition: { path: "/nutrition", ready: (l) => tr(l, "Bugünkü Öğünler", "Today's Meals") },
  workouts: { path: "/workouts", ready: (l) => tr(l, "Haftalık Hedef", "Weekly Goal") },
  progress: { path: "/progress", ready: (l) => tr(l, "Kilo Hedefi", "Weight Goal") },
  profile: { path: "/profile", ready: (l) => tr(l, "Hedeflerin", "Your Goals") },
};

async function login(lang) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `store-${lang}@pulsecoachapp.com`, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`giriş başarısız (${lang}): ${res.status}`);
  return res.json();
}

async function photoFlow(page, lang) {
  await page.getByText(tr(lang, "Öğün Kaydet", "Log Meal"), { exact: true }).first().click();
  await page.getByText(tr(lang, "Fotoğrafla", "From Photo"), { exact: true }).first().click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByText(tr(lang, "Galeriden Seç", "Gallery"), { exact: true }).first().click();
  await (await chooser).setFiles(MEAL_PHOTO);
  // Analiz gerçek model çağrısı (12b, ilk yüklemede yavaş).
  await page.getByText(tr(lang, "Tanınan:", "Detected:")).first().waitFor({ timeout: 300_000 });
  // Fotoğraf küçük resmi ekranın üstüne yakın dursun: "Kameradan Çek" düğmesi tepeden ~150pt.
  await page.evaluate((label) => {
    const el = [...document.querySelectorAll("div")].find((d) => d.textContent === label);
    let sc = el?.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight && getComputedStyle(sc).overflowY !== "visible")) sc = sc.parentElement;
    if (el && sc) sc.scrollTop += el.getBoundingClientRect().top - 150;
  }, tr(lang, "Kameradan Çek", "Take Photo"));
}

const browser = await chromium.launch();
const onlyScreen = arg("only");
for (const lang of arg("lang") ? [arg("lang")] : ["tr", "en"]) {
  for (const theme of arg("theme") ? [arg("theme")] : ["light", "dark"]) {
    // Her bağlam kendi girişini yapar: uygulama açılışta yenileme anahtarını döndürebilir, eski anahtar geçersizleşir.
    const tokens = await login(lang);
    const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 3, locale: lang === "tr" ? "tr-TR" : "en-US", timezoneId: "Europe/Istanbul" });
    await ctx.addInitScript(
      ({ access, refresh, theme, lang }) => {
        // Anahtarlar yalnız ilk sayfada yazılır; sonraki sayfalar uygulamanın yenilediği anahtarı ezmesin.
        if (!localStorage.getItem("pulsecoach_token")) {
          localStorage.setItem("pulsecoach_token", access);
          localStorage.setItem("pulsecoach_refresh_token", refresh);
        }
        localStorage.setItem("pulsecoach_theme", theme);
        localStorage.setItem("pulsecoach_language", lang);
      },
      { access: tokens.access_token, refresh: tokens.refresh_token, theme, lang },
    );
    // Her ekran kendi sekmesinde: aynı sekmede ikinci goto sonrası Expo web içeriği görünür olmuyordu.
    for (const [id, screen] of Object.entries(SCREENS)) {
      if (onlyScreen && id !== onlyScreen) continue;
      const page = await ctx.newPage();
      // Expo web'de HMR yüzünden "networkidle" gelmez: load + hazır metni bekle.
      await page.goto(APP + screen.path, { waitUntil: "load" });
      // Tam eşleşme: metni İÇEREN ilk öğe gizli bir öğe (ipucu metni vb.) olabiliyor.
      try {
        await page.getByText(screen.ready(lang), { exact: id !== "chat" }).first().waitFor({ timeout: 60_000 });
      } catch (err) {
        await page.screenshot({ path: join(here, `hata-${theme}-${lang}-${id}.png`) });
        throw err;
      }
      await page.addStyleTag({ content: "*::-webkit-scrollbar{display:none} *{scrollbar-width:none}" });
      if (id === "photo") await photoFlow(page, lang);
      if (id === "chat") {
        // Sohbet açılışta "Bugün" panelini açık getirir: tarih çipine basıp kapat.
        await page.getByText(/^\d{1,2} \S+ \S+$|^\S+, \S+ \d{1,2}$/).first().click();
      }
      await page.waitForTimeout(2500); // sayı/grafik geçişleri ve kutlama bitsin
      const dir = join(here, "raw", theme, lang);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${id}.png`) });
      console.log(`ok ${theme}/${lang}/${id}`);
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
