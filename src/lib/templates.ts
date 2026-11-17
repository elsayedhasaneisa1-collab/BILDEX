import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { db } from "@/db";
import {
  templateAssets,
  templateCategories,
  templateComments,
  templateFavorites,
  templatePurchases,
  templateRatings,
  templateReviews,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { assertDocument, blankDocument, cloneDocument } from "./document";
import { HttpError, slugify } from "./http";
import { audit, notify } from "./notify";
import { can } from "./permissions";
import type { SessionUser, WebsiteDocument } from "./types";
import { cacheRemember, cacheDelete } from "./redis";

const ZIP_EXT = new Set(["html", "css", "js", "json", "svg", "png", "jpg", "jpeg", "webp", "woff2", "txt", "md"]);

export async function listTemplates(query: { q?: string; category?: string; group?: string; sort?: string; page?: number; tier?: string }) {
  const page = Math.max(1, query.page || 1);
  const limit = 12;
  const cacheKey = `templates:list:${JSON.stringify({ q: query.q || "", category: query.category || "", group: query.group || "", sort: query.sort || "rating", page, tier: query.tier || "" })}`;
  return cacheRemember(cacheKey, 45, async () => {
    const filters = [eq(templates.status, "PUBLISHED")];
    if (query.q) filters.push(or(ilike(templates.name, `%${query.q.slice(0, 60)}%`), ilike(templates.description, `%${query.q.slice(0, 60)}%`))!);
    if (query.tier) filters.push(eq(templates.tier, query.tier));
    if (query.category) filters.push(eq(templateCategories.key, query.category));
    if (query.group) filters.push(eq(templateCategories.group, query.group));
    const rows = await db
      .select({
        template: {
          id: templates.id,
          designerId: templates.designerId,
          name: templates.name,
          slug: templates.slug,
          description: templates.description,
          categoryId: templates.categoryId,
          price: templates.price,
          tier: templates.tier,
          version: templates.version,
          status: templates.status,
          license: templates.license,
          previewImage: templates.previewImage,
          images: templates.images,
          ratingAvg: templates.ratingAvg,
          ratingCount: templates.ratingCount,
          usesCount: templates.usesCount,
          publishedAt: templates.publishedAt,
          createdAt: templates.createdAt,
          updatedAt: templates.updatedAt,
        },
        category: templateCategories,
        designer: { id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl },
      })
      .from(templates)
      .leftJoin(templateCategories, eq(templates.categoryId, templateCategories.id))
      .innerJoin(users, eq(templates.designerId, users.id))
      .where(and(...filters))
      .orderBy(query.sort === "new" ? desc(templates.publishedAt) : query.sort === "used" ? desc(templates.usesCount) : desc(templates.ratingAvg))
      .limit(limit)
      .offset((page - 1) * limit);
    return { items: rows, page, pageSize: limit };
  });
}

export async function getPublishedTemplate(slug: string) {
  return cacheRemember(`templates:detail:${slug}`, 45, async () => {
    const rows = await db
      .select({
        template: {
          id: templates.id,
          designerId: templates.designerId,
          name: templates.name,
          slug: templates.slug,
          description: templates.description,
          categoryId: templates.categoryId,
          price: templates.price,
          tier: templates.tier,
          version: templates.version,
          status: templates.status,
          license: templates.license,
          previewImage: templates.previewImage,
          images: templates.images,
          ratingAvg: templates.ratingAvg,
          ratingCount: templates.ratingCount,
          usesCount: templates.usesCount,
          publishedAt: templates.publishedAt,
          createdAt: templates.createdAt,
          updatedAt: templates.updatedAt,
        },
        category: templateCategories,
        designer: { id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl, headline: users.headline },
      })
      .from(templates)
      .leftJoin(templateCategories, eq(templates.categoryId, templateCategories.id))
      .innerJoin(users, eq(templates.designerId, users.id))
      .where(and(eq(templates.slug, slug), eq(templates.status, "PUBLISHED")))
      .limit(1);
    return rows[0] || null;
  });
}

export async function canCreateTemplates(user: SessionUser) {
  return can(user, "templates.create") || user.features.canCreateTemplates || user.role === "designer";
}

async function uniqueTemplateSlug(name: string) {
  let slug = slugify(name) || `template-${Date.now().toString(36)}`;
  for (let i = 0; i < 5; i += 1) {
    const exists = await db.select({ id: templates.id }).from(templates).where(eq(templates.slug, slug)).limit(1);
    if (!exists[0]) return slug;
    slug = `${slugify(name).slice(0, 32) || "template"}-${i + 2}`;
  }
  return `template-${Date.now().toString(36)}`;
}

export async function createTemplateDraft(user: SessionUser, input: { name: string; description?: string; categoryKey?: string; document?: unknown; price?: number; tier?: string; license?: string }) {
  if (!(await canCreateTemplates(user))) throw new HttpError(403, "Template creation requires the Designer plan or designer role.", "DESIGNER");
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new HttpError(400, "Name the template.", "NAME");
  let document: WebsiteDocument;
  try {
    document = input.document ? assertDocument(input.document) : blankDocument(name);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid document", "DOCUMENT");
  }
  const categories = input.categoryKey
    ? await db.select().from(templateCategories).where(eq(templateCategories.key, input.categoryKey)).limit(1)
    : [];
  const [row] = await db
    .insert(templates)
    .values({
      designerId: user.id,
      name,
      slug: await uniqueTemplateSlug(name),
      description: (input.description || "").slice(0, 600),
      categoryId: categories[0]?.id || null,
      price: Math.max(0, Math.min(50000, Number(input.price) || 0)),
      tier: ["free", "plus", "pro"].includes(input.tier || "") ? input.tier! : "free",
      license: ["use", "remix"].includes(input.license || "") ? input.license! : "use",
      document,
      status: "DRAFT",
    })
    .returning();
  await audit(user.id, "template.create", "template", row.id, { name });
  await cacheDelete(`templates:detail:${row.slug}`);
  return { id: row.id, name: row.name, slug: row.slug, status: row.status };
}

export async function saveTemplateDocument(user: SessionUser, id: string, input: unknown, changelog = "") {
  const rows = await db.select({ id: templates.id, designerId: templates.designerId, status: templates.status, version: templates.version, slug: templates.slug })
    .from(templates).where(eq(templates.id, id)).limit(1);
  const template = rows[0];
  if (!template || (template.designerId !== user.id && !can(user, "templates.review"))) throw new HttpError(404, "Template not found.", "NOT_FOUND");
  if (template.designerId !== user.id) throw new HttpError(403, "You can only edit your own template.", "FORBIDDEN");
  let document: WebsiteDocument;
  try {
    document = assertDocument(input);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid document", "DOCUMENT");
  }
  if (template.status === "PUBLISHED") {
    await db.insert(templateVersions).values({ templateId: id, version: template.version, document, status: "PENDING", changelog: changelog.slice(0, 400) });
    await db.execute(sql`delete from template_versions v where v.id in (
      select id from template_versions where template_id = ${id}
      order by created_at desc offset 10
    ) and v.status <> 'PENDING' and not exists (select 1 from template_reviews r where r.version_id = v.id)`);
    await db.update(templates).set({ updatedAt: new Date() }).where(eq(templates.id, id));
    await cacheDelete(`templates:detail:${template.slug}`);
    return { pending: true };
  }
  await db.update(templates).set({ document, updatedAt: new Date() }).where(eq(templates.id, id));
  await cacheDelete(`templates:detail:${template.slug}`);
  return { pending: false };
}

export async function submitTemplate(user: SessionUser, id: string) {
  const rows = await db.select({ id: templates.id, name: templates.name, status: templates.status, hasPendingChanges: sql<boolean>`${templates.pendingDocument} is not null or exists (select 1 from template_versions tv where tv.template_id = ${templates.id} and tv.status = 'PENDING')` })
    .from(templates).where(and(eq(templates.id, id), eq(templates.designerId, user.id))).limit(1);
  const template = rows[0];
  if (!template) throw new HttpError(404, "Template not found.", "NOT_FOUND");
  if (template.status === "PUBLISHED" && template.hasPendingChanges) {
    await notifyReviewers(template.name, id);
    return { status: template.status, pending: true };
  }
  if (!["DRAFT", "REJECTED"].includes(template.status)) throw new HttpError(400, "This template is already in review or published.", "STATE");
  await db.update(templates).set({ status: "PENDING", updatedAt: new Date() }).where(eq(templates.id, id));
  await notifyReviewers(template.name, id);
  await audit(user.id, "template.submit", "template", id, {});
  return { status: "PENDING" };
}

async function notifyReviewers(name: string, id: string) {
  const reviewers = await db.select({ id: users.id }).from(users).where(sql`${users.role} in ('reviewer', 'admin', 'owner') and ${users.status} = 'active'`);
  for (const reviewer of reviewers) {
    await notify(reviewer.id, "review", "Template waiting", `${name} needs a review decision.`, `/admin/reviews`);
  }
  void id;
}

export async function importTemplateJson(user: SessionUser, name: string, raw: unknown) {
  return createTemplateDraft(user, { name, document: raw });
}

export async function quarantineZip(user: SessionUser, file: File, name: string) {
  if (!(await canCreateTemplates(user))) throw new HttpError(403, "Template creation requires the Designer plan or designer role.", "DESIGNER");
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) throw new HttpError(400, "ZIP must be between 1 byte and 8MB.", "ZIP");
  const buffer = Buffer.from(await file.arrayBuffer());
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new HttpError(400, "The file is not a valid ZIP.", "ZIP");
  }
  const names = Object.keys(zip.files);
  if (names.length === 0 || names.length > 80) throw new HttpError(400, "ZIP must contain 1 to 80 files.", "ZIP");
  let total = 0;
  const manifest: { filename: string; size: number }[] = [];
  for (const entryName of names) {
    if (entryName.includes("..") || entryName.startsWith("/") || entryName.includes("\\") || entryName.includes("\0")) {
      throw new HttpError(400, "ZIP contains an unsafe path.", "ZIP");
    }
    const entry = zip.files[entryName];
    if (!entry || entry.dir) continue;
    const ext = entryName.split(".").pop()?.toLowerCase() || "";
    if (!ZIP_EXT.has(ext)) throw new HttpError(400, `Blocked file type: .${ext || "unknown"}`, "ZIP");
    const bytes = await entry.async("uint8array");
    total += bytes.byteLength;
    if (total > 20 * 1024 * 1024) throw new HttpError(400, "Uncompressed archive is too large.", "ZIP");
    manifest.push({ filename: entryName.slice(0, 180), size: bytes.byteLength });
  }
  if (!manifest.length) throw new HttpError(400, "ZIP has no files.", "ZIP");
  const draft = await createTemplateDraft(user, {
    name: name || file.name.replace(/\.zip$/i, ""),
    description: "Uploaded archive. Files are quarantined and are not executed or published.",
    document: blankDocument(name || "Upload"),
  });
  const storagePath = `${draft.id}/${draft.id}.zip`;
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_QUARANTINE_BUCKET || "buildex-quarantine";
  if (supabaseUrl && serviceKey) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/zip", "x-upsert": "false" },
      body: buffer as unknown as BodyInit,
      cache: "no-store",
    });
    if (!response.ok) throw new HttpError(502, "Private quarantine storage rejected the archive.", "STORAGE");
  } else {
    if (process.env.NODE_ENV === "production") throw new HttpError(503, "Configure a private Supabase quarantine bucket before accepting ZIP uploads.", "STORAGE_CONFIG");
    const dir = path.join(process.cwd(), "storage", "quarantine");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${draft.id}.zip`), buffer);
  }
  await db.insert(templateAssets).values(manifest.map((item) => ({
    templateId: draft.id,
    filename: item.filename,
    storagePath,
    mime: "application/zip",
    size: item.size,
    safetyStatus: "quarantined",
  })));
  await db.update(templates).set({ status: "PENDING", description: `Quarantined ZIP with ${manifest.length} files. Not executed.` }).where(eq(templates.id, draft.id));
  await audit(user.id, "template.zip", "template", draft.id, { files: manifest.length, bytes: file.size });
  return { id: draft.id, files: manifest.length, status: "PENDING" };
}

export async function remixTemplate(user: SessionUser, templateId: string) {
  if (!(await canCreateTemplates(user))) throw new HttpError(403, "Remixing requires designer access.", "DESIGNER");
  const rows = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  const template = rows[0];
  if (!template || template.status !== "PUBLISHED") throw new HttpError(404, "Template not found.", "NOT_FOUND");
  if (template.license !== "remix" && template.designerId !== user.id) throw new HttpError(403, "This license does not allow remixing.", "LICENSE");
  if (template.price > 0 && template.designerId !== user.id) {
    const purchase = await db.select({ id: templatePurchases.id }).from(templatePurchases).where(and(eq(templatePurchases.templateId, template.id), eq(templatePurchases.buyerId, user.id))).limit(1);
    if (!purchase[0]) throw new HttpError(402, "Purchase the template before remixing it.", "PURCHASE");
  }
  return createTemplateDraft(user, {
    name: `${template.name} remix`,
    description: template.description,
    document: cloneDocument(template.document),
    categoryKey: undefined,
    license: "use",
    tier: template.tier,
  });
}

export async function designerTemplates(userId: string) {
  return db.select({
    id: templates.id,
    name: templates.name,
    slug: templates.slug,
    status: templates.status,
    hasPendingChanges: sql<boolean>`${templates.pendingDocument} is not null or exists (select 1 from template_versions tv where tv.template_id = ${templates.id} and tv.status = 'PENDING')`,
    usesCount: templates.usesCount,
    updatedAt: templates.updatedAt,
  }).from(templates).where(eq(templates.designerId, userId)).orderBy(desc(templates.updatedAt));
}

export async function templateCommentsFor(templateId: string) {
  return db
    .select({ id: templateComments.id, body: templateComments.body, createdAt: templateComments.createdAt, name: users.name, username: users.username })
    .from(templateComments)
    .innerJoin(users, eq(templateComments.userId, users.id))
    .where(and(eq(templateComments.templateId, templateId), eq(templateComments.hidden, false)))
    .orderBy(desc(templateComments.createdAt))
    .limit(40);
}

export async function addComment(user: SessionUser, templateId: string, body: string) {
  const text = body.trim().slice(0, 600);
  if (text.length < 2) throw new HttpError(400, "Write a comment.", "COMMENT");
  const rows = await db.select({ designerId: templates.designerId, slug: templates.slug }).from(templates).where(and(eq(templates.id, templateId), eq(templates.status, "PUBLISHED"))).limit(1);
  if (!rows[0]) throw new HttpError(404, "Template not found.", "NOT_FOUND");
  const [comment] = await db.insert(templateComments).values({ templateId, userId: user.id, body: text }).returning();
  if (rows[0].designerId !== user.id) await notify(rows[0].designerId, "comment", "New comment", text.slice(0, 140), `/templates/${rows[0].slug}`);
  return comment;
}

export async function rateTemplate(user: SessionUser, templateId: string, score: number) {
  if (score < 1 || score > 5) throw new HttpError(400, "Score must be 1 to 5.", "RATING");
  const rows = await db.select({ status: templates.status }).from(templates).where(eq(templates.id, templateId)).limit(1);
  if (!rows[0] || rows[0].status !== "PUBLISHED") throw new HttpError(404, "Template not found.", "NOT_FOUND");
  await db
    .insert(templateRatings)
    .values({ userId: user.id, templateId, score })
    .onConflictDoUpdate({ target: [templateRatings.userId, templateRatings.templateId], set: { score } });
  const [summary] = await db.select({ avg: sql<number>`round(avg(${templateRatings.score}) * 100)::int`, total: sql<number>`count(*)::int` })
    .from(templateRatings).where(eq(templateRatings.templateId, templateId));
  const avg = Number(summary?.avg || 0);
  const total = Number(summary?.total || 0);
  await db.update(templates).set({ ratingAvg: avg, ratingCount: total }).where(eq(templates.id, templateId));
  return { ratingAvg: avg / 100, ratingCount: total };
}

export async function toggleFavorite(user: SessionUser, templateId: string) {
  const existing = await db.select({ templateId: templateFavorites.templateId }).from(templateFavorites).where(and(eq(templateFavorites.userId, user.id), eq(templateFavorites.templateId, templateId))).limit(1);
  if (existing[0]) {
    await db.delete(templateFavorites).where(and(eq(templateFavorites.userId, user.id), eq(templateFavorites.templateId, templateId)));
    return { favorite: false };
  }
  await db.insert(templateFavorites).values({ userId: user.id, templateId });
  return { favorite: true };
}

export async function reviewTemplate(actor: SessionUser, templateId: string, decision: "UNDER_REVIEW" | "APPROVED" | "PUBLISHED" | "REJECTED" | "SUSPENDED", reason: string) {
  if (!can(actor, "templates.review") && decision !== "PUBLISHED") throw new HttpError(403, "Review permission required.", "FORBIDDEN");
  if (decision === "PUBLISHED" && !can(actor, "templates.publish")) throw new HttpError(403, "Publishing a template requires the publish permission.", "FORBIDDEN");
  const rows = await db.select({ id: templates.id, designerId: templates.designerId, name: templates.name, slug: templates.slug, status: templates.status, version: templates.version, publishedAt: templates.publishedAt, pendingDocument: templates.pendingDocument })
    .from(templates).where(eq(templates.id, templateId)).limit(1);
  const template = rows[0];
  if (!template) throw new HttpError(404, "Template not found.", "NOT_FOUND");
  if (template.designerId === actor.id && actor.role !== "owner") throw new HttpError(403, "You cannot review your own template.", "SELF_REVIEW");
  const note = reason.trim().slice(0, 800);
  if (["REJECTED", "SUSPENDED"].includes(decision) && note.length < 4) throw new HttpError(400, "A reason is required.", "REASON");
  const pendingRows = template.pendingDocument ? [] : await db.select().from(templateVersions)
    .where(and(eq(templateVersions.templateId, templateId), eq(templateVersions.status, "PENDING")))
    .orderBy(desc(templateVersions.createdAt)).limit(1);
  const pendingVersion = pendingRows[0] || null;
  const pendingDocument = template.pendingDocument || pendingVersion?.document || null;
  const status = decision === "APPROVED" ? "APPROVED" : decision === "PUBLISHED" ? "PUBLISHED" : decision === "REJECTED" ? "REJECTED" : decision === "SUSPENDED" ? "SUSPENDED" : "UNDER_REVIEW";
  const patch: Partial<typeof templates.$inferInsert> = { status, updatedAt: new Date() };
  if (decision === "PUBLISHED") {
    if (pendingDocument) {
      patch.document = pendingDocument;
      patch.pendingDocument = null;
      patch.version = bump(template.version);
    }
    patch.publishedAt = template.publishedAt || new Date();
  }
  if (decision === "REJECTED") patch.pendingDocument = null;
  await db.update(templates).set(patch).where(eq(templates.id, templateId));
  if (["PUBLISHED", "REJECTED"].includes(decision)) {
    await db.update(templateVersions).set({ status: decision }).where(and(eq(templateVersions.templateId, templateId), eq(templateVersions.status, "PENDING")));
  }
  await db.insert(templateReviews).values({ templateId, versionId: pendingVersion?.id || null, reviewerId: actor.id, decision, reason: note });
  await notify(template.designerId, "review", `Template ${decision.toLowerCase()}`, note || `${template.name} is now ${status}.`, "/designer/templates");
  await audit(actor.id, `template.${decision.toLowerCase()}`, "template", templateId, { reason: note });
  await cacheDelete(`templates:detail:${template.slug}`);
  return { status };
}

function bump(version: string) {
  const parts = version.split(".").map((part) => Number(part) || 0);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join(".");
}

export async function purchasedIds(userId: string) {
  const rows = await db.select({ id: templatePurchases.templateId }).from(templatePurchases).where(eq(templatePurchases.buyerId, userId));
  return rows.map((row) => row.id);
}
