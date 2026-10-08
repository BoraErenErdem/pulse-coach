"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { useMediaQuery } from "@/lib/use-media-query";

// Tanıtım sayfasının hareket parçaları (2026-10-08). Hepsi "hareketi azalt" tercihine uyar
// (globals.css/landing.module.css'te animasyonlar kapanır, sayaç doğrudan son değeri gösterir).

/** Öğe görünür alana girince bir kez `true` olur. */
export function useInView<T extends Element>(rootMargin = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return { ref, inView };
}

/** Görününce yumuşakça yukarı kayarak belirir (`delay` ms ile sıralı). */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <Tag ref={ref} data-in={inView ? "" : undefined} className={`l-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** Görününce 0'dan hedefe sayar. `format` son metni üretir (binlik ayırıcı, "+" vb.). */
export function CountUp({ to, format, duration = 1400 }: { to: number; format: (n: number) => string; duration?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(0);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  useEffect(() => {
    if (!inView || reduced) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, to, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {/* Ekran okuyucu sayımı değil son değeri duysun. */}
      <span aria-hidden="true">{format(reduced ? to : value)}</span>
      <span className="sr-only">{format(to)}</span>
    </span>
  );
}
