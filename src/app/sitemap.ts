import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { websites } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/templates", "/designers", "/pricing", "/features", "/explore", "/faq", "/about", "/help", "/academy", "/updates", "/contact", "/legal/privacy", "/legal/terms"].map((path) => ({
    url: path || "/",
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.6,
  }));
  const sites = await db.select({ slug: websites.slug, updatedAt: websites.updatedAt }).from(websites).where(eq(websites.status, "PUBLISHED")).limit(2000);
  return [...staticRoutes, ...sites.map((site) => ({ url: `/s/${site.slug}`, lastModified: site.updatedAt, changeFrequency: "weekly" as const, priority: 0.4 }))];
}
