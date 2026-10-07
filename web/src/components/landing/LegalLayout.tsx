"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage, useT } from "@/lib/language-context";
import { BackLink } from "@/components/BackLink";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { outfit } from "./fonts";
import s from "./landing.module.css";

// Gizlilik/KVKK ve Kullanım Koşulları (2026-10-07): tanıtım sayfasıyla aynı üst çubuk, alt bilgi,
// renkler ve Outfit başlık. Masaüstünde solda yapışkan "Bu sayfada" listesi; liste, metindeki
// id'li başlıklardan (h2 bölüm, h3 madde) okunuyor - içerik tek yerde kalsın, TR/EN ayrı liste yok.

interface TocEntry {
  id: string;
  label: string;
  level: 2 | 3;
}

export function LegalLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const t = useT();
  const { language } = useLanguage();
  const articleRef = useRef<HTMLElement>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);

  // Dil değişince metin yeniden çizildikten sonra okunur (rAF: commit sonrası DOM).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const headings = articleRef.current?.querySelectorAll<HTMLElement>("h2[id], h3[id]") ?? [];
      setToc(
        Array.from(headings).map((h) => ({ id: h.id, label: h.textContent ?? "", level: h.tagName === "H2" ? 2 : 3 }))
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [language]);

  return (
    <div className={`${s.root} ${outfit.variable} flex min-h-full flex-1 flex-col`}>
      <SiteHeader anchorBase="/" />
      <main id="icerik" className="flex-1">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:pt-12">
          <BackLink />
          <h1 className={`${s.display} mt-4 text-[clamp(2.5rem,7vw,4.25rem)]`}>{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--l-muted)] sm:text-lg">{intro}</p>

          <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,48rem)]">
            {toc.length > 0 ? (
              <nav className="hidden lg:block" aria-label={t("Bu sayfada", "On this page")}>
                <div className="sticky top-24">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--l-muted)]">{t("Bu sayfada", "On this page")}</p>
                  <ul className="flex max-h-[calc(100dvh-8rem)] flex-col gap-0.5 overflow-y-auto border-l border-[var(--l-line)] pr-2">
                    {toc.map((entry) => (
                      <li key={entry.id}>
                        <a
                          href={`#${entry.id}`}
                          className={`-ml-px block border-l-2 border-transparent py-1.5 text-sm leading-snug text-[var(--l-muted)] transition-colors hover:border-[var(--l-accent)] hover:text-[var(--l-ink)] ${
                            entry.level === 2 ? "pl-3 font-semibold" : "pl-6"
                          }`}
                        >
                          {entry.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            ) : (
              <div className="hidden lg:block" />
            )}
            <article
              ref={articleRef}
              className="min-w-0 rounded-[28px] border border-[var(--l-line)] bg-[var(--l-card)] p-6 sm:p-10"
            >
              {children}
            </article>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
