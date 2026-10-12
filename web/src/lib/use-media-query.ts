"use client";

import { useSyncExternalStore } from "react";

/** Masaüstü düzeni (lg+) mü? Canlı izlemez: bir `useState` başlangıç değeri için (ör. kayıt
 * formları masaüstünde açık, telefonda katlı başlar). Sunucuda `false`. */
export function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

/** CSS medya sorgusunun canlı sonucu (ör. masaüstü düzeni). Sunucuda `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
