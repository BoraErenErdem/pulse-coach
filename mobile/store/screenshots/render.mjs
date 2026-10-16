// App Store ekran görüntülerini üretir: slides.js'teki her slayt x dil x tema için template.html'i
// 1320x2868 (6.9" iPhone, dikey) olarak çeker -> out/<dil>/<tema>/<sıra>-<id>.png, ayrıca her
// dil x tema için tek sayfalık önizleme -> out/onizleme-<dil>-<tema>.png.
//
// Kullanım (repo kökünden): node mobile/store/screenshots/render.mjs [--only chat]
// Girdi: raw/<tema>/<dil>/<id>.png (ya da .jpg) - uygulama ekranı (light|dark, tr|en).
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

function source(id, lang, theme) {
  for (const ext of ["png", "jpg", "jpeg"]) {
    const raw = join(here, "raw", theme, lang, `${id}.${ext}`);
    if (existsSync(raw)) return { file: raw, draft: false };
  }
  const name = `${id}${theme === "dark" ? "-dark" : ""}${lang === "en" ? "-en" : ""}.webp`;
  return { file: join(repo, "web", "public", "landing", "screens", name), draft: true };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
let failed = false;

for (const lang of ["tr", "en"]) {
  for (const theme of ["light", "dark"]) {
    const outDir = join(here, "out", lang, theme);
    mkdirSync(outDir, { recursive: true });
    const made = [];
    for (const [i, slide] of slides.entries()) {
      if (only && slide.id !== only) continue;
      const src = source(slide.id, lang, theme);
      const url = new URL(pathToFileURL(join(here, "template.html")));
      url.search = new URLSearchParams({ id: slide.id, lang, theme, src: pathToFileURL(src.file).href }).toString();
      await page.goto(url.href);
      await page.waitForFunction(() => document.body.dataset.ready);
      const state = await page.evaluate(() => document.body.dataset.ready);
      const base = `${String(i + 1).padStart(2, "0")}-${slide.id}`;
      // Önceki çalıştırmanın diğer türünü (taslak/gerçek) sil: klasörde tek sürüm kalsın.
      for (const suffix of ["", "-TASLAK"]) rmSync(join(outDir, `${base}${suffix}.png`), { force: true });
      const out = join(outDir, `${base}${src.draft ? "-TASLAK" : ""}.png`);
      // App Store saydamlık (alfa kanalı) kabul etmez: sayfa zemini her yerde dolu, PNG opak.
      await page.screenshot({ path: out, type: "png", omitBackground: false });
      made.push(out);
      console.log(`${state === "ok" ? "ok  " : "TAŞTI"} ${lang}/${theme}/${base}${src.draft ? "  (taslak ekran)" : ""}`);
      if (state !== "ok") failed = true;
    }
    if (!only) await preview(made, join(here, "out", `onizleme-${lang}-${theme}.png`), theme);
  }
}

// 3x2 ızgarada küçültülmüş önizleme (yalnız göz atmak için, mağazaya gitmez).
async function preview(files, out, theme) {
  const sheet = await browser.newPage({ viewport: { width: 1360, height: 1942 }, deviceScaleFactor: 1 });
  const imgs = files.map((f) => `<img src="${pathToFileURL(f).href}">`).join("");
  const bg = theme === "dark" ? "#05080a" : "#ffffff";
  // about:blank'ten file:// görsel yüklenmez: önce bir dosya adresine git, içeriği onun üstüne yaz.
  await sheet.goto(pathToFileURL(join(here, "template.html")).href);
  await sheet.setContent(
    `<body style="margin:0;padding:10px;background:${bg};display:grid;grid-template-columns:repeat(3,440px);gap:10px">` +
      `<style>img{width:440px;height:956px;display:block}</style>${imgs}</body>`,
  );
  await sheet.waitForFunction(() => [...document.images].every((i) => i.complete));
  await sheet.screenshot({ path: out });
  await sheet.close();
}

await browser.close();
if (failed) {
  console.error("Bazı başlıklar alana sığmadı: slides.js'teki metni kısalt.");
  process.exit(1);
}
