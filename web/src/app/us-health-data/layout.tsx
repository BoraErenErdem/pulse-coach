import type { Metadata } from "next";

// Sayfa istemci bileşeni (dil düğmesi), metadata burada (bkz. terms/layout.tsx).
export const metadata: Metadata = {
  title: "Consumer Health Data Privacy Policy - PulseCoach",
  description:
    "How PulseCoach collects, uses and shares consumer health data under U.S. state laws such as Washington's My Health My Data Act, and how to exercise your rights.",
  alternates: { canonical: "https://pulsecoachapp.com/us-health-data" },
};

export default function UsHealthDataLayout({ children }: { children: React.ReactNode }) {
  return children;
}
