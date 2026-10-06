import { Archivo } from "next/font/google";

// Tanıtım sayfası başlıkları: geniş kesimli (wdth) kalın Archivo - spor forması/afiş
// hissi. next/font derleme anında indirip kendi sunucumuzdan verir; ziyaretçinin
// tarayıcısı Google'a bağlanmaz (KVKK: üçüncü taraf istek yok).
export const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});
