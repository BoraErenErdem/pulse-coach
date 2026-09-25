import { createContext, useCallback, useContext, type ReactNode } from "react";

// Sekmeye özel YÜZEY TONU (2026-09-24, "B" varyantı - kullanıcı onayı): koyu
// modda ekranın tepesindeki parıltı ve alt panellerin (ProgressSectionCard/
// ProgressFormCard/GoalInviteCard, sayfa sheet'leri) rengi artık sekmenin
// kimliğinden geliyor. Önceden HER sekmede İlerleme'nin turuncu parıltısı +
// turuncu-kahve panel rampası vardı - İlerleme'nin kimliği bütün sekmelere
// sızıyordu (zeytin Beslenme kartları turuncu panellerle çatışıyordu).
//
// Kural (A/B/C karşılaştırmasından): kimlik VURGU katmanında (parıltı, kahraman
// kart, birincil eylem), paneller NÖTR sıcak-koyu + kimlikten küçük bir pay
// (~%7). Tam kimlik renkli paneller (C) reddedildi: kahraman kart zeminde
// kayboluyor, veri renkleri (makro/grafik) aynı aileden zeminde ayrışmıyordu.
// Açık tema DEĞİŞMEZ (düz krem politikası).
//
// Performans (§9): ton nesneleri modül seviyesinde SABİT - Provider değeri her
// render'da aynı referans, tüketiciler gereksiz yere yeniden render olmaz.

export interface SurfaceTone {
  /** Koyu mod panel rampası: t 0 (sayfada en üst) .. 1 (en alt). */
  ramp: { t: number; color: string }[];
  /** ScreenGlow rengi "r,g,b". */
  glowRgb: string;
  /** Koyu mod panel dış parıltısı. */
  panelGlow: string;
}

/** Varsayılan = önceki (turuncu) görünüm - ton verilmeyen ekranlar değişmez. */
export const DEFAULT_SURFACE_TONE: SurfaceTone = {
  ramp: [
    { t: 0, color: "#7E4023" },
    { t: 0.35, color: "#6A3922" },
    { t: 0.7, color: "#583123" },
    { t: 1, color: "#4A2D22" },
  ],
  glowRgb: "255,138,61",
  panelGlow: "#E8792F",
};

/** Beslenme: sıcak nötr taban (#3F3A33 → #2B2824) + %7 zeytin (#CCD638);
 * beyaz metin kontrastı panelin en açık ucunda 9.6:1. Parıltı zeytin. */
export const NUTRITION_SURFACE_TONE: SurfaceTone = {
  ramp: [
    { t: 0, color: "#494533" },
    { t: 0.35, color: "#423E2E" },
    { t: 0.7, color: "#3C3929" },
    { t: 1, color: "#363425" },
  ],
  glowRgb: "190,208,60",
  panelGlow: "#8C990F",
};

/** Antrenman: sıcak nötr taban + %7 kırmızı (#FF453A); beyaz metin 10.6:1.
 * Parıltı kırmızı (kimlik tonundan biraz yumuşak - tam #FF453A tepede sert
 * bir alarm hissi veriyordu). */
export const WORKOUT_SURFACE_TONE: SurfaceTone = {
  ramp: [
    { t: 0, color: "#4C3B33" },
    { t: 0.35, color: "#46342E" },
    { t: 0.7, color: "#3F2F29" },
    { t: 1, color: "#3A2A26" },
  ],
  glowRgb: "240,72,58",
  panelGlow: "#D93A2B",
};

/** İlerleme: parıltı AYNI turuncu (sayfanın kendi kimliği); paneller sıcak nötr
 * + %10 turuncu (diğerlerinden biraz fazla - onaylanmış sıcak karakter korunsun).
 * Çok renkli metrik kimlikleri nötr zeminde daha okunaklı: kilo 3.39→4.09,
 * bel 4.28→5.18, ruh hali 4.57→5.52 (panel üst ucunda kontrast). */
export const PROGRESS_SURFACE_TONE: SurfaceTone = {
  ramp: [
    { t: 0, color: "#524234" },
    { t: 0.35, color: "#4C3C2F" },
    { t: 0.7, color: "#46362A" },
    { t: 1, color: "#403226" },
  ],
  glowRgb: "255,138,61",
  panelGlow: "#E8792F",
};

/** Profil (2026-09-25): sıcak nötr taban + %7 ametist (#B98CFF); ametist metin
 * rolü (#C4A0FF) panelin en açık ucunda 4.71:1. Parıltı ametist. */
export const PROFILE_SURFACE_TONE: SurfaceTone = {
  ramp: [
    { t: 0, color: "#484041" },
    { t: 0.35, color: "#433B3E" },
    { t: 0.7, color: "#3C3639" },
    { t: 1, color: "#352F33" },
  ],
  glowRgb: "185,140,255",
  panelGlow: "#8A5CD6",
};

/** Ruh Hali alt sayfası: sıcak nötr taban + %7 ruh hali camgöbeği (#4DD6E6,
 * progress-identity.ts::mood); camgöbeği panelin en açık ucunda 5.63:1. */
export const MOOD_SURFACE_TONE: SurfaceTone = {
  ramp: [
    { t: 0, color: "#404540" },
    { t: 0.35, color: "#3B403D" },
    { t: 0.7, color: "#353B37" },
    { t: 1, color: "#2D3432" },
  ],
  glowRgb: "77,214,230",
  panelGlow: "#1E9FB0",
};

const SurfaceToneContext = createContext<SurfaceTone>(DEFAULT_SURFACE_TONE);

export function SurfaceToneProvider({ tone, children }: { tone: SurfaceTone; children: ReactNode }) {
  return <SurfaceToneContext.Provider value={tone}>{children}</SurfaceToneContext.Provider>;
}

export function useSurfaceTone(): SurfaceTone {
  return useContext(SurfaceToneContext);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rampColorOf(ramp: SurfaceTone["ramp"], t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < ramp.length; i += 1) {
    const a = ramp[i - 1];
    const b = ramp[i];
    if (clamped <= b.t) {
      const f = (clamped - a.t) / (b.t - a.t || 1);
      const [ar, ag, ab] = hexToRgb(a.color);
      const [br, bg, bb] = hexToRgb(b.color);
      const ch = (x: number, y: number) => Math.round(x + (y - x) * f).toString(16).padStart(2, "0");
      return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
    }
  }
  return ramp[ramp.length - 1].color;
}

/** Bulunulan ekranın tonuna göre panel rampası rengi. */
export function useRampColor(): (t: number) => string {
  const { ramp } = useSurfaceTone();
  return useCallback((t: number) => rampColorOf(ramp, t), [ramp]);
}
