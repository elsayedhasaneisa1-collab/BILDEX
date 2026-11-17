import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/studio", "/admin", "/designer", "/api", "/checkout"] },
    sitemap: "/sitemap.xml",
  };
}
