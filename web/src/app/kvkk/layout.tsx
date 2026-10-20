import type { Metadata } from "next";

// Sayfa istemci bileşeni (dil düğmesi), metadata burada (2026-10-20): arama sonucunda yalnız
// "PulseCoach" görünüyordu.
export const metadata: Metadata = {
  title: "Gizlilik ve KVKK - PulseCoach",
  description:
    "PulseCoach'ta hangi verilerin hangi amaçla işlendiği, nerede ve ne kadar süre saklandığı, kimlere aktarıldığı ve KVKK kapsamındaki hakların.",
  alternates: { canonical: "https://pulsecoachapp.com/kvkk" },
};

export default function KvkkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
