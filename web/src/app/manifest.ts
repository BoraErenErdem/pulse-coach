import type { MetadataRoute } from "next";

// Ana ekrana ekleme (Android/masaüstü Chrome) ve arama motorları için uygulama
// kimliği. İkonlar public/icons'ta; tarayıcı sekmesi ikonları app/icon.svg,
// app/favicon.ico ve app/apple-icon.png (Next dosya kuralı) ile ayrıca veriliyor.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PulseCoach",
    short_name: "PulseCoach",
    description: "Yapay zekâ destekli sağlık ve fitness koçu",
    lang: "tr",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    background_color: "#fbf6ed",
    theme_color: "#dd5b2e",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
