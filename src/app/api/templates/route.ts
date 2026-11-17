import { eq } from "drizzle-orm";
import { db } from "@/db";
import { templateCategories, templateFavorites } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { getSessionUser, requireUser } from "@/lib/auth";
import { assertCsrf, handle, readJson } from "@/lib/http";
import { createTemplateDraft, importTemplateJson, listTemplates, quarantineZip } from "@/lib/templates";
import { cacheRemember } from "@/lib/redis";

export async function GET(req: Request) {
  return handle(async () => {
    await ensureSeed();
    const url = new URL(req.url);
    const data = await listTemplates({
      q: url.searchParams.get("q") || undefined,
      category: url.searchParams.get("category") || undefined,
      group: url.searchParams.get("group") || undefined,
      sort: url.searchParams.get("sort") || undefined,
      tier: url.searchParams.get("tier") || undefined,
      page: Number(url.searchParams.get("page") || 1),
    });
    const categories = await cacheRemember("templates:categories", 300, () => db.select().from(templateCategories).orderBy(templateCategories.sortOrder));
    const user = await getSessionUser();
    const favorites = user ? await db.select({ templateId: templateFavorites.templateId }).from(templateFavorites).where(eq(templateFavorites.userId, user.id)) : [];
    return { ...data, categories, favoriteIds: favorites.map((row) => row.templateId) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const type = req.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Attach a ZIP file.");
      return quarantineZip(user, file, String(form.get("name") || ""));
    }
    const body = await readJson<{ name?: string; description?: string; document?: unknown; categoryKey?: string; price?: number; tier?: string; license?: string; import?: boolean }>(req);
    if (body.import) return importTemplateJson(user, body.name || "Imported template", body.document);
    return createTemplateDraft(user, { name: body.name || "", description: body.description, document: body.document, categoryKey: body.categoryKey, price: body.price, tier: body.tier, license: body.license });
  });
}

