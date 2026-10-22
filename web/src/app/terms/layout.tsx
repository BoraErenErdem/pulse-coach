import type { Metadata } from "next";

// Sayfa istemci bileşeni (dil düğmesi), metadata burada (bkz. kvkk/layout.tsx).
export const metadata: Metadata = {
  title: "Kullanım Koşulları - PulseCoach",
  description: "PulseCoach'u kullanırken geçerli koşullar: hizmetin kapsamı, yapay zeka koçunun sınırları, hesap ve sorumluluklar.",
  alternates: { canonical: "https://pulsecoachapp.com/terms" },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
