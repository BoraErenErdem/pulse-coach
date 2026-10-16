// App Store ekran görüntülerini üretir: slides.js'teki her slayt x dil için template.html'i
// 1320x2868 (6.9" iPhone, dikey) olarak çeker -> out/<dil>/<sıra>-<id>.png.
//
// Kullanım (repo kökünden): node mobile/store/screenshots/render.mjs [--only chat]
// Girdi: raw/<dil>/<id>.png (ya da .jpg) - iPhone'dan alınmış ekran görüntüsü (iPhone 11: 828x1792).
// Yoksa tanıtım sayfasının ekranları (web/public/landing/screens) TASLAK olarak kullanılır;
// taslakla üretilen görsel mağazaya YÜKLENMEZ (dosya adı -TASLAK ile biter).
// Playwright web/'in bağımlılığından gelir; fontlar Google Fonts'tan (ağ gerekir).
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const require = createRequire(join(repo, "web", "package.json"));
const { chromium } = require("playwright");

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(here, "slides.js"), "utf8"), sandbox);
const slides = sandbox.window.SLIDES;

const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

function source(id, lang) {
  for (const ext of ["png", "jpg", "jpeg"]) {
    const raw = join(here, "raw", lang, `${id}.${ext}`);
    if (existsSync(raw)) return { file: raw, draft: false };
  }
  const name = `${id}${lang === "en" ? "-en" : ""}.webp`;
  return { file: join(repo, "web", "public", "landing", "screens", name), draft: true };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
let failed = false;

for (const lang of ["tr", "en"]) {
  const outDir = join(here, "out", lang);
  mkdirSync(outDir, { recursive: true });
  for (const [i, slide] of slides.entries()) {
    if (only && slide.id !== only) continue;
    const src = source(slide.id, lang);
    const url = new URL(pathToFileURL(join(here, "template.html")));
    url.search = new URLSearchParams({ id: slide.id, lang, src: pathToFileURL(src.file).href }).toString();
    await page.goto(url.href);
    await page.waitForFunction(() => document.body.dataset.ready);
    const state = await page.evaluate(() => document.body.dataset.ready);
    const base = `${String(i + 1).padStart(2, "0")}-${slide.id}`;
    // Önceki çalıştırmanın diğer türünü (taslak/gerçek) sil: klasörde tek sürüm kalsın.
    for (const suffix of ["", "-TASLAK"]) rmSync(join(outDir, `${base}${suffix}.png`), { force: true });
    const out = join(outDir, `${base}${src.draft ? "-TASLAK" : ""}.png`);
    // App Store saydamlık (alfa kanalı) kabul etmez: JPEG'e çevirmeden opak PNG için
    // omitBackground kapalı; sayfa zemini her yerde dolu.
    await page.screenshot({ path: out, type: "png", omitBackground: false });
    console.log(`${state === "ok" ? "ok  " : "TAŞTI"} ${lang}/${base}${src.draft ? "  (taslak ekran)" : ""}`);
    if (state !== "ok") failed = true;
  }
}

await browser.close();
if (failed) {
  console.error("Bazı başlıklar alana sığmadı: slides.js'teki metni kısalt.");
  process.exit(1);
}
