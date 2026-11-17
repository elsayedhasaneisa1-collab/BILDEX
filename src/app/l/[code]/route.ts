import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shortLinks, websites } from "@/db/schema";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const rows = await db.select({ slug: websites.slug, status: websites.status }).from(shortLinks).innerJoin(websites, eq(shortLinks.websiteId, websites.id)).where(eq(shortLinks.code, code)).limit(1);
  const row = rows[0];
  if (!row || row.status !== "PUBLISHED") return Response.redirect(new URL("/", _req.url));
  return Response.redirect(new URL(`/s/${row.slug}`, _req.url));
}
