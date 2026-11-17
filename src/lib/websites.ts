import bcrypt from "bcryptjs";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  formSubmissions,
  guestbookEntries,
  shortLinks,
  templatePurchases,
  templates,
  websitePages,
  websiteSettings,
  websiteVersions,
  websites,
} from "@/db/schema";
import { RESERVED_SLUGS } from "./constants";
import {
  assertDocument,
  blankDocument,
  cloneDocument,
  findNewViolations,
  hashDocument,
  pageBySlug,
  tierAllows,
} from "./document";
import { HttpError, randomToken, slugify } from "./http";
import { audit, notify } from "./notify";
import { inspectDocument } from "./inspector";
import type { SessionUser, WebsiteDocument } from "./types";
import { cacheDelete, localCacheRemember } from "./redis";

async function owned(userId: string, id: string) {
  const rows = await db.select().from(websites).where(and(eq(websites.id, id), eq(websites.ownerId, userId))).limit(1);
  const site = rows[0];
  if (!site) throw new HttpError(404, "Website not found.", "NOT_FOUND");
  return site;
}

async function countSites(userId: string) {
  const [row] = await db.select({ total: count() }).from(websites).where(eq(websites.ownerId, userId));
  return Number(row?.total || 0);
}

async function uniqueSlug(base: string) {
  let slug = slugify(base) || `site-${randomToken(3)}`;
  if (RESERVED_SLUGS.has(slug) || slug.length < 3) slug = `site-${randomToken(3)}`;
  for (let i = 0; i < 6; i += 1) {
    const exists = await db.select({ id: websites.id }).from(websites).where(eq(websites.slug, slug)).limit(1);
    if (!exists[0]) return slug;
    slug = `${slugify(base).slice(0, 32) || "site"}-${randomToken(2)}`;
  }
  return `site-${randomToken(4)}`;
}

async function syncWebsitePages(websiteId: string, doc: WebsiteDocument) {
  await db.delete(websitePages).where(eq(websitePages.websiteId, websiteId));
  if (doc.pages.length) {
    await db.insert(websitePages).values(doc.pages.map((page, index) => ({
      websiteId,
      pageKey: page.id,
      name: page.name,
      slug: page.slug,
      sort: index,
    })));
  }
}

async function syncWebsiteSettings(websiteId: string, site: typeof websites.$inferSelect) {
  const seo = { title: site.seoTitle, description: site.seoDescription, image: site.ogImage };
  const access = { password: Boolean(site.passwordHash), explore: site.showInExplore };
  const domain = { host: site.customDomain, status: site.domainStatus };
  const publishing = { status: site.status, scheduledAt: site.scheduledAt, expiresAt: site.expiresAt, branding: !site.removeBranding };
  await db.insert(websiteSettings).values({ websiteId, seo, access, domain, publishing }).onConflictDoUpdate({
    target: websiteSettings.websiteId,
    set: { seo, access, domain, publishing, updatedAt: new Date() },
  });
}

async function syncProjection(websiteId: string, doc: WebsiteDocument, site: typeof websites.$inferSelect) {
  await Promise.all([syncWebsitePages(websiteId, doc), syncWebsiteSettings(websiteId, site)]);
}

function pagesSignature(doc: WebsiteDocument) {
  return JSON.stringify(doc.pages.map((page, index) => [page.id, page.name, page.slug, index]));
}

export async function listWebsites(user: SessionUser) {
  return db.select({ id: websites.id, name: websites.name, slug: websites.slug, status: websites.status, category: websites.category, updatedAt: websites.updatedAt, createdAt: websites.createdAt, publishedAt: websites.publishedAt, expiresAt: websites.expiresAt })
    .from(websites).where(eq(websites.ownerId, user.id)).orderBy(desc(websites.updatedAt));
}

export async function createWebsite(user: SessionUser, input: { name: string; templateId?: string | null }) {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new HttpError(400, "Name the website first.", "NAME");
  const used = await countSites(user.id);
  if (used >= user.features.maxWebsites) {
    throw new HttpError(403, `Your plan allows ${user.features.maxWebsites} website${user.features.maxWebsites === 1 ? "" : "s"}.`, "LIMIT");
  }
  let document = blankDocument(name);
  let templateId: string | null = null;
  let templateVersion: string | null = null;
  let category = "personal";
  if (input.templateId) {
    const rows = await db.select().from(templates).where(eq(templates.id, input.templateId)).limit(1);
    const template = rows[0];
    if (!template || template.status !== "PUBLISHED") throw new HttpError(404, "Template is not published.", "TEMPLATE");
    if (!tierAllows(user.features.templateTier, template.tier)) {
      throw new HttpError(403, "This template needs a higher plan.", "TIER");
    }
    if (template.price > 0) {
      const purchase = await db
        .select({ id: templatePurchases.id })
        .from(templatePurchases)
        .where(and(eq(templatePurchases.templateId, template.id), eq(templatePurchases.buyerId, user.id)))
        .limit(1);
      if (!purchase[0] && template.designerId !== user.id) throw new HttpError(402, "Purchase this template before using it.", "PURCHASE");
    }
    document = cloneDocument(template.document);
    templateId = template.id;
    templateVersion = template.version;
    category = template.tier === "pro" ? "business" : "personal";
    if (template.price === 0) {
      await db.update(templates).set({ usesCount: sql`${templates.usesCount} + 1` }).where(eq(templates.id, template.id));
    }
  }
  const slug = await uniqueSlug(name);
  const [site] = await db
    .insert(websites)
    .values({
      ownerId: user.id,
      name,
      slug,
      status: "DRAFT",
      document,
      draftHash: hashDocument(document),
      templateId,
      templateVersion,
      category,
      seoTitle: name,
      seoDescription: `${name} — built with BUILDEX.`,
    })
    .returning();
  await syncProjection(site.id, document, site);
  await audit(user.id, "website.create", "website", site.id, { name, templateId });
  return site;
}

export async function getOwnedWebsite(user: SessionUser, id: string) {
  return owned(user.id, id);
}

export async function saveWebsiteDocument(user: SessionUser, id: string, input: unknown) {
  const site = await owned(user.id, id);
  let document: WebsiteDocument;
  try {
    document = assertDocument(input);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid document", "DOCUMENT");
  }
  const nextHash = hashDocument(document);
  if (nextHash === site.draftHash) {
    return { savedAt: site.updatedAt.toISOString(), hash: site.draftHash, unpublished: site.publishedHash !== site.draftHash, unchanged: true };
  }
  const violations = findNewViolations(site.document, document, user.features);
  if (violations.length) throw new HttpError(403, violations[0], "PLAN_FEATURE");
  const pagesChanged = pagesSignature(site.document) !== pagesSignature(document);
  const preservePublished = site.status === "PUBLISHED" && !site.publishedDocument && Boolean(site.publishedHash) && site.publishedHash === site.draftHash;
  const collapsePublished = site.status === "PUBLISHED" && Boolean(site.publishedDocument) && site.publishedHash === nextHash;
  const [updated] = await db.update(websites).set({
    document,
    draftHash: nextHash,
    ...(preservePublished ? { publishedDocument: site.document } : collapsePublished ? { publishedDocument: null } : {}),
    updatedAt: new Date(),
  }).where(eq(websites.id, id)).returning();
  if (pagesChanged) await syncWebsitePages(id, document);
  await cacheDelete(`public-site:${site.slug}`);
  return { savedAt: updated.updatedAt.toISOString(), hash: updated.draftHash, unpublished: updated.publishedHash !== updated.draftHash, unchanged: false };
}

export async function mutateWebsite(
  user: SessionUser,
  id: string,
  action: string,
  body: Record<string, unknown>,
) {
  const site = await owned(user.id, id);
  if (action === "rename") {
    const name = String(body.name || "").trim().slice(0, 80);
    if (name.length < 2) throw new HttpError(400, "Name is too short.", "NAME");
    await db.update(websites).set({ name, updatedAt: new Date() }).where(eq(websites.id, id));
    await cacheDelete(`public-site:${site.slug}`);
    await audit(user.id, "website.rename", "website", id, { name });
    return { ok: true };
  }
  if (action === "slug") {
    if (!user.features.customSlug) throw new HttpError(403, "Custom slugs require Pro.", "PLAN_FEATURE");
    const slug = slugify(String(body.slug || ""));
    if (slug.length < 3 || RESERVED_SLUGS.has(slug)) throw new HttpError(400, "Choose a different slug.", "SLUG");
    const clash = await db.select({ id: websites.id }).from(websites).where(and(eq(websites.slug, slug), ne(websites.id, id))).limit(1);
    if (clash[0]) throw new HttpError(409, "That slug is already used.", "SLUG");
    await db.update(websites).set({ slug, updatedAt: new Date() }).where(eq(websites.id, id));
    await Promise.all([cacheDelete(`public-site:${site.slug}`), cacheDelete(`public-site:${slug}`)]);
    await audit(user.id, "website.slug", "website", id, { slug });
    return { ok: true, slug };
  }
  if (action === "duplicate") {
    if ((await countSites(user.id)) >= user.features.maxWebsites) throw new HttpError(403, "Website limit reached.", "LIMIT");
    const slug = await uniqueSlug(`${site.name}-copy`);
    const document = cloneDocument(site.document);
    const [copy] = await db
      .insert(websites)
      .values({
        ownerId: user.id,
        name: `${site.name} copy`.slice(0, 80),
        slug,
        status: "DRAFT",
        document,
        draftHash: hashDocument(document),
        category: site.category,
        seoTitle: site.seoTitle,
        seoDescription: site.seoDescription,
      })
      .returning();
    await syncProjection(copy.id, document, copy);
    return copy;
  }
  if (action === "delete") {
    if (String(body.confirm || "") !== site.name) throw new HttpError(400, "Type the website name to delete it.", "CONFIRM");
    await db.delete(websites).where(eq(websites.id, id));
    await cacheDelete(`public-site:${site.slug}`);
    await audit(user.id, "website.delete", "website", id, { name: site.name });
    return { ok: true };
  }
  if (action === "checkpoint") {
    if (user.features.versionHistory < 1) throw new HttpError(403, "Version history starts on Plus.", "PLAN_FEATURE");
    await snapshot(site.id, site.document, user.id, String(body.label || "Checkpoint"));
    return { ok: true };
  }
  if (action === "restore") {
    if (user.features.versionHistory < 1) throw new HttpError(403, "Version history starts on Plus.", "PLAN_FEATURE");
    const versions = await db.select().from(websiteVersions).where(and(eq(websiteVersions.id, String(body.versionId)), eq(websiteVersions.websiteId, id))).limit(1);
    const version = versions[0];
    if (!version) throw new HttpError(404, "Version not found.", "VERSION");
    await snapshot(site.id, site.document, user.id, "Before restore");
    const document = assertDocument(version.document);
    const nextHash = hashDocument(document);
    const preservePublished = site.status === "PUBLISHED" && !site.publishedDocument && Boolean(site.publishedHash) && site.publishedHash === site.draftHash;
    const collapsePublished = site.status === "PUBLISHED" && Boolean(site.publishedDocument) && site.publishedHash === nextHash;
    await db.update(websites).set({ document, draftHash: nextHash, ...(preservePublished ? { publishedDocument: site.document } : collapsePublished ? { publishedDocument: null } : {}), updatedAt: new Date() }).where(eq(websites.id, id));
    await syncWebsitePages(id, document);
    await cacheDelete(`public-site:${site.slug}`);
    await audit(user.id, "website.restore", "website", id, { versionId: version.id });
    return { document };
  }
  if (action === "unpublish") {
    await db.update(websites).set({ status: "UNPUBLISHED", updatedAt: new Date() }).where(eq(websites.id, id));
    await cacheDelete(`public-site:${site.slug}`);
    await audit(user.id, "website.unpublish", "website", id, {});
    return { ok: true };
  }
  if (action === "publish") return publish(user, site, body);
  throw new HttpError(400, "Unknown action.", "ACTION");
}

async function snapshot(websiteId: string, document: WebsiteDocument, userId: string, label: string) {
  await db.insert(websiteVersions).values({ websiteId, document, label: label.slice(0, 80), createdBy: userId });
  await db.execute(sql`delete from website_versions where id in (
    select id from website_versions where website_id = ${websiteId}
    order by created_at desc offset 10
  )`);
}

async function publish(user: SessionUser, site: typeof websites.$inferSelect, body: Record<string, unknown>) {
  const blocking = inspectDocument(site.document).filter((issue) => issue.severity === "high" && issue.id.startsWith("outside:"));
  if (blocking.length) throw new HttpError(400, `Move ${blocking.length} element(s) back inside the canvas before publishing.`, "QUALITY_BLOCK");
  const [liveCount] = await db.select({ total: count() }).from(websites)
    .where(and(eq(websites.ownerId, user.id), sql`${websites.status} in ('PUBLISHED', 'SCHEDULED')`));
  const alreadyLive = site.status === "PUBLISHED" || site.status === "SCHEDULED";
  if (!alreadyLive && Number(liveCount?.total || 0) >= user.features.maxWebsites) {
    throw new HttpError(403, "Publishing limit reached for your plan.", "LIMIT");
  }
  const scheduleAt = body.scheduleAt ? new Date(String(body.scheduleAt)) : null;
  const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
  if (scheduleAt && !user.features.scheduledPublishing) throw new HttpError(403, "Scheduled publishing requires Pro.", "PLAN_FEATURE");
  if (scheduleAt && Number.isNaN(scheduleAt.getTime())) throw new HttpError(400, "Invalid schedule.", "DATE");
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new HttpError(400, "Invalid expiry.", "DATE");
  if (body.removeBranding && user.features.branding) throw new HttpError(403, "Removing the BUILDEX mark requires Pro.", "PLAN_FEATURE");
  let passwordHash = site.passwordHash;
  if (body.password === null) {
    if (!user.features.passwordProtection) throw new HttpError(403, "Password protection requires Pro.", "PLAN_FEATURE");
    passwordHash = null;
  } else if (typeof body.password === "string" && body.password.length) {
    if (!user.features.passwordProtection) throw new HttpError(403, "Password protection requires Pro.", "PLAN_FEATURE");
    if (body.password.length < 4) throw new HttpError(400, "Use a longer site password.", "PASSWORD");
    passwordHash = await bcrypt.hash(String(body.password), 10);
  }
  let customDomain = site.customDomain;
  let domainStatus = site.domainStatus;
  let domainToken = site.domainToken;
  if (body.customDomain !== undefined) {
    if (!user.features.customDomain) throw new HttpError(403, "Custom domains require Pro.", "PLAN_FEATURE");
    const host = String(body.customDomain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (host && !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host)) throw new HttpError(400, "Enter a domain like example.com.", "DOMAIN");
    customDomain = host || null;
    domainToken = host ? `buildex-verify=${randomToken(8)}` : null;
    domainStatus = host ? "pending" : "none";
  }
  const seoTitle = String(body.seoTitle || site.seoTitle || site.name).slice(0, 80);
  const seoDescription = String(body.seoDescription || site.seoDescription || "").slice(0, 180);
  const category = slugify(String(body.category || site.category || "personal")) || "personal";
  const showInExplore = Boolean(body.showInExplore);
  const now = new Date();
  const scheduled = scheduleAt && scheduleAt.getTime() > now.getTime();
  const status = scheduled ? "SCHEDULED" : "PUBLISHED";
  const [updated] = await db
    .update(websites)
    .set({
      status,
      publishedDocument: scheduled ? (site.publishedDocument || (site.publishedHash && site.publishedHash !== site.draftHash ? site.document : null)) : null,
      publishedHash: scheduled ? site.publishedHash : hashDocument(site.document),
      publishedAt: scheduled ? site.publishedAt : now,
      scheduledAt: scheduled ? scheduleAt : null,
      expiresAt,
      passwordHash,
      customDomain,
      domainStatus,
      domainToken,
      seoTitle,
      seoDescription,
      category,
      showInExplore,
      removeBranding: Boolean(body.removeBranding) && !user.features.branding,
      updatedAt: now,
    })
    .where(eq(websites.id, site.id))
    .returning();
  if (user.features.versionHistory > 0) await snapshot(site.id, site.document, user.id, scheduled ? "Scheduled" : "Published");
  const link = await db.select().from(shortLinks).where(eq(shortLinks.websiteId, site.id)).limit(1);
  if (!link[0]) await db.insert(shortLinks).values({ websiteId: site.id, code: randomToken(4) });
  await syncWebsiteSettings(site.id, updated);
  await cacheDelete(`public-site:${site.slug}`);
  await notify(user.id, "publish", scheduled ? "Publish scheduled" : "Site published", `${site.name} is ${scheduled ? "scheduled" : "live"}.`, `/s/${updated.slug}`);
  await audit(user.id, "website.publish", "website", site.id, { status });
  return updated;
}

export async function listVersions(user: SessionUser, id: string) {
  await owned(user.id, id);
  if (user.features.versionHistory < 1) return [];
  return db.select({ id: websiteVersions.id, label: websiteVersions.label, createdAt: websiteVersions.createdAt }).from(websiteVersions).where(eq(websiteVersions.websiteId, id)).orderBy(desc(websiteVersions.createdAt));
}

export async function getPublicSite(slug: string) {
  return localCacheRemember(`public-site:${slug}`, 15, async () => {
    const rows = await db.select({
      id: websites.id,
      ownerId: websites.ownerId,
      name: websites.name,
      slug: websites.slug,
      status: websites.status,
      publishedDocument: sql<WebsiteDocument | null>`coalesce(${websites.publishedDocument}, case when ${websites.publishedHash} = ${websites.draftHash} then ${websites.document} else null end)`,
      passwordHash: websites.passwordHash,
      removeBranding: websites.removeBranding,
      seoTitle: websites.seoTitle,
      seoDescription: websites.seoDescription,
      ogImage: websites.ogImage,
      expiresAt: websites.expiresAt,
      publishedAt: websites.publishedAt,
    }).from(websites).where(eq(websites.slug, slug)).limit(1);
    return rows[0] || null;
  });
}

export function publicDocument(site: { status: string; publishedDocument: WebsiteDocument | null; expiresAt: Date | null }) {
  if (site.status !== "PUBLISHED") return null;
  if (site.expiresAt && site.expiresAt < new Date()) return null;
  return site.publishedDocument;
}

export async function recordSubmission(websiteId: string, pageSlug: string, elementId: string, payload: Record<string, string>) {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload).slice(0, 12)) clean[key.slice(0, 40)] = String(value).slice(0, 1000);
  await db.insert(formSubmissions).values({ websiteId, pageSlug, elementId, payload: clean });
}

export async function addGuestbook(websiteId: string, elementId: string, name: string, message: string) {
  if (name.trim().length < 2 || message.trim().length < 2) throw new HttpError(400, "Name and message are required.", "GUESTBOOK");
  await db.insert(guestbookEntries).values({ websiteId, elementId, name: name.trim().slice(0, 60), message: message.trim().slice(0, 400) });
}

export async function listGuestbook(websiteId: string, elementId: string) {
  return db
    .select({ id: guestbookEntries.id, name: guestbookEntries.name, message: guestbookEntries.message, createdAt: guestbookEntries.createdAt })
    .from(guestbookEntries)
    .where(and(eq(guestbookEntries.websiteId, websiteId), eq(guestbookEntries.elementId, elementId), eq(guestbookEntries.hidden, false)))
    .orderBy(desc(guestbookEntries.createdAt))
    .limit(30);
}

export async function listSubmissions(user: SessionUser, id: string) {
  await owned(user.id, id);
  return db.select().from(formSubmissions).where(eq(formSubmissions.websiteId, id)).orderBy(desc(formSubmissions.createdAt)).limit(100);
}

export { pageBySlug };
