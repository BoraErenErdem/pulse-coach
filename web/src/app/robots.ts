import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulsecoachapp.com";

// Yalnız herkese açık sayfalar taranır; uygulama ekranları oturum ister.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/kvkk", "/terms"], disallow: ["/api/", "/chat", "/oauth-consent", "/reset-password"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
