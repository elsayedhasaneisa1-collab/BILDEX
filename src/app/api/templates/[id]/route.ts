import { ensureSeed } from "@/db/seed";
import { requireUser } from "@/lib/auth";
import { assertCsrf, handle, HttpError, readJson } from "@/lib/http";
import { db } from "@/db";
import { templatePurchases, templates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { addComment, rateTemplate, remixTemplate, saveTemplateDocument, submitTemplate, toggleFavorite } from "@/lib/templates";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const { id } = await ctx.params;
    const rows = await db.select({ price: templates.price, designerId: templates.designerId }).from(templates).where(and(eq(templates.id, id), eq(templates.status, "PUBLISHED"))).limit(1);
    const template = rows[0];
    if (!template) throw new HttpError(404, "Template not found.", "NOT_FOUND");
    if (template.price === 0 || template.designerId === user.id) return { purchased: true };
    const purchases = await db.select({ id: templatePurchases.id }).from(templatePurchases).where(and(eq(templatePurchases.templateId, id), eq(templatePurchases.buyerId, user.id))).limit(1);
    return { purchased: Boolean(purchases[0]) };
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await readJson<Record<string, unknown>>(req);
    const action = String(body.action || "");
    if (action === "save") return saveTemplateDocument(user, id, body.document, String(body.changelog || ""));
    if (action === "submit") return submitTemplate(user, id);
    if (action === "favorite") return toggleFavorite(user, id);
    if (action === "rate") return rateTemplate(user, id, Number(body.score));
    if (action === "comment") return addComment(user, id, String(body.body || ""));
    if (action === "remix") return remixTemplate(user, id);
    throw new HttpError(400, "Unknown template action.", "ACTION");
  });
}
