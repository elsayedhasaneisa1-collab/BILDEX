import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  coupons,
  designerIdCards,
  designerPosts,
  designerProfiles,
  permissions,
  rolePermissions,
  roles,
  shortLinks,
  sessions,
  subscriptionPlans,
  subscriptions,
  systemSettings,
  templateCategories,
  templates,
  userRoles,
  users,
  websites,
} from "@/db/schema";
import { CATALOG, CATEGORY_SEEDS } from "@/lib/catalog";
import { ALL_PERMISSIONS, PLAN_COPY, ROLE_DEFAULTS, featuresFor } from "@/lib/constants";
import { cloneDocument, hashDocument } from "@/lib/document";
import type { PlanKey } from "@/lib/types";
import { randomToken } from "@/lib/http";

let pending: Promise<void> | null = null;

export function ensureSeed() {
  if (!pending) pending = runSeed().catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}

async function runSeed() {
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, "seedVersion")).limit(1);
  if (existing[0] && Number(existing[0].value) >= 2) {
    await bootstrapOwner();
    return;
  }

  const roleIds = new Map<string, string>();
  for (const key of Object.keys(ROLE_DEFAULTS)) {
    const [row] = await db
      .insert(roles)
      .values({ key, name: key[0].toUpperCase() + key.slice(1), description: `${key} role` })
      .onConflictDoNothing()
      .returning();
    const found = row || (await db.select().from(roles).where(eq(roles.key, key)).limit(1))[0];
    roleIds.set(key, found.id);
  }
  const permIds = new Map<string, string>();
  for (const key of ALL_PERMISSIONS) {
    const [row] = await db.insert(permissions).values({ key, description: key }).onConflictDoNothing().returning();
    const found = row || (await db.select().from(permissions).where(eq(permissions.key, key)).limit(1))[0];
    permIds.set(key, found.id);
  }
  for (const [roleKey, perms] of Object.entries(ROLE_DEFAULTS)) {
    const roleId = roleIds.get(roleKey);
    if (!roleId) continue;
    const keys = perms.includes("*") ? ALL_PERMISSIONS : perms;
    for (const perm of keys) {
      const permissionId = permIds.get(perm);
      if (!permissionId) continue;
      await db.insert(rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
    }
  }

  const planIds = new Map<string, string>();
  const prices: Record<PlanKey, [number, number, number]> = {
    free: [0, 0, 0],
    plus: [1200, 3200, 9600],
    pro: [2900, 7500, 24000],
    designer: [1900, 4900, 15600],
  };
  for (const [index, key] of (Object.keys(prices) as PlanKey[]).entries()) {
    const [monthly, quarterly, yearly] = prices[key];
    const [row] = await db
      .insert(subscriptionPlans)
      .values({
        key,
        name: PLAN_COPY[key].name,
        description: PLAN_COPY[key].blurb,
        priceMonthly: monthly,
        priceQuarterly: quarterly,
        priceYearly: yearly,
        features: featuresFor(key),
        sortOrder: index,
      })
      .onConflictDoNothing()
      .returning();
    const found = row || (await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.key, key)).limit(1))[0];
    planIds.set(key, found.id);
  }

  const categoryIds = new Map<string, string>();
  for (const [index, [key, group, name]] of CATEGORY_SEEDS.entries()) {
    const [row] = await db
      .insert(templateCategories)
      .values({ key, group, name, description: `${name} templates`, sortOrder: index })
      .onConflictDoNothing()
      .returning();
    const found = row || (await db.select().from(templateCategories).where(eq(templateCategories.key, key)).limit(1))[0];
    categoryIds.set(key, found.id);
  }

  const userIds = new Map<string, string>();
  const legacyEmails = ["owner@buildex.app", "reviewer@buildex.app", "support@buildex.app"];
  for (const email of legacyEmails) {
    await db.update(users).set({ status: "suspended", updatedAt: new Date() }).where(eq(users.email, email));
    const legacy = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (legacy[0]) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, legacy[0].id));
  }

  const studioEmail = "studio@buildex.app";
  const studioPasswordHash = await bcrypt.hash(randomToken(48), 12);
  const studioExisting = await db.select().from(users).where(eq(users.email, studioEmail)).limit(1);
  let studioUser = studioExisting[0];
  if (studioUser) {
    await db.update(users).set({ passwordHash: studioPasswordHash, role: "designer", status: "active", updatedAt: new Date() }).where(eq(users.id, studioUser.id));
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, studioUser.id));
  } else {
    const [created] = await db.insert(users).values({
      email: studioEmail,
      username: "buildex-catalog",
      name: "BUILDEX Studio",
      passwordHash: studioPasswordHash,
      role: "designer",
      headline: "Official catalog desk",
      bio: "Official BUILDEX catalog studio.",
      locale: "en",
    }).returning();
    studioUser = created;
  }
  userIds.set("designer", studioUser.id);
  const designerRole = roleIds.get("designer");
  if (designerRole) await db.insert(userRoles).values({ userId: studioUser.id, roleId: designerRole }).onConflictDoNothing();
  const designerPlan = planIds.get("designer");
  if (designerPlan) {
    const active = await db.select().from(subscriptions).where(eq(subscriptions.userId, studioUser.id)).limit(1);
    if (!active[0]) await db.insert(subscriptions).values({ userId: studioUser.id, planId: designerPlan, status: "active", interval: "year", currentPeriodEnd: new Date(Date.now() + 365 * 86400000) });
  }

  const studioId = userIds.get("designer");
  if (studioId) {
    const membershipId = "BDX-2026-STUDIO";
    await db.insert(designerProfiles).values({
      userId: studioId,
      membershipId,
      skills: ["Editorial", "Invitations", "Business sites"],
      specialties: ["LOVE", "OCCASIONS", "BUSINESS"],
      verified: true,
      official: true,
      coverUrl: "/images/hero-studio.png",
    }).onConflictDoNothing();
    await db.insert(designerIdCards).values({
      userId: studioId,
      membershipId,
      roleLabel: "BUILDEX Team",
      design: "team",
      status: "active",
    }).onConflictDoNothing();
    await db.insert(designerPosts).values({
      designerId: studioId,
      body: "The catalog is open. Every template is a real document you can edit in Studio. Empty categories are waiting for approved work, not fake listings.",
      imageUrl: "/images/hero-studio.png",
    });
    for (const item of CATALOG) {
      await db.insert(templates).values({
        designerId: studioId,
        name: item.name,
        slug: item.slug,
        description: item.description,
        categoryId: categoryIds.get(item.category) || null,
        price: item.price,
        tier: item.tier,
        version: "1.0.0",
        status: "PUBLISHED",
        license: item.license,
        previewImage: item.preview,
        images: item.images,
        document: item.document,
        ratingAvg: 0,
        ratingCount: 0,
        usesCount: 0,
        publishedAt: new Date(),
      }).onConflictDoNothing();
    }
    const showcaseDoc = cloneDocument(CATALOG.find((item) => item.slug === "northline-company")!.document);
    const [site] = await db.insert(websites).values({
      ownerId: studioId,
      name: "Northline Showcase",
      slug: "northline-showcase",
      status: "PUBLISHED",
      document: showcaseDoc,
      publishedDocument: showcaseDoc,
      draftHash: hashDocument(showcaseDoc),
      publishedHash: hashDocument(showcaseDoc),
      category: "company",
      showInExplore: true,
      seoTitle: "Northline Showcase",
      seoDescription: "An official BUILDEX showcase site published from the company template.",
      publishedAt: new Date(),
      removeBranding: false,
    }).onConflictDoNothing().returning();
    if (site) await db.insert(shortLinks).values({ websiteId: site.id, code: "northline" }).onConflictDoNothing();
  }

  await db.insert(coupons).values({
    code: "WELCOME10",
    percentOff: 10,
    maxUses: 100,
    active: true,
    endsAt: new Date("2026-12-31T23:59:59Z"),
  }).onConflictDoNothing();

  const settings: [string, unknown][] = [
    ["seedVersion", 2],
    ["commissionRate", 20],
    ["platformName", "BUILDEX"],
    ["analyticsRetentionDays", 400],
    ["maintenance", { enabled: false, message: "" }],
    ["announcement", { title: "", body: "" }],
  ];
  for (const [key, value] of settings) {
    const insert = db.insert(systemSettings).values({ key, value });
    if (key === "seedVersion") await insert.onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
    else await insert.onConflictDoNothing();
  }
  await bootstrapOwner();
}

async function bootstrapOwner() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || "";
  if (!email || !password) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 16 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Set OWNER_EMAIL and a strong OWNER_PASSWORD (at least 16 characters with letters and numbers).");
  }
  const marker = await db.select().from(systemSettings).where(eq(systemSettings.key, "ownerBootstrapEmail")).limit(1);
  if (marker[0]?.value === email) return;
  const ownerRole = await db.select().from(roles).where(eq(roles.key, "owner")).limit(1);
  if (!ownerRole[0]) return;
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const passwordHash = await bcrypt.hash(password, 12);
  const baseUsername = (process.env.OWNER_USERNAME || "buildex-owner").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "buildex_owner";
  if (existing[0]) {
    await db.update(users).set({ passwordHash, role: "owner", status: "active", name: process.env.OWNER_NAME || "BUILDEX Owner", updatedAt: new Date() }).where(eq(users.id, existing[0].id));
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, existing[0].id));
    await db.delete(userRoles).where(eq(userRoles.userId, existing[0].id));
    await db.insert(userRoles).values({ userId: existing[0].id, roleId: ownerRole[0].id }).onConflictDoNothing();
  } else {
    const usernameConflict = await db.select({ id: users.id }).from(users).where(eq(users.username, baseUsername)).limit(1);
    const username = usernameConflict[0] ? `${baseUsername.slice(0, 17)}_${randomToken(3).slice(0, 6)}` : baseUsername;
    const [owner] = await db.insert(users).values({
      email,
      username,
      name: process.env.OWNER_NAME || "BUILDEX Owner",
      passwordHash,
      role: "owner",
      status: "active",
      headline: "Platform owner",
      bio: "BUILDEX platform owner.",
      locale: "ar",
    }).returning();
    await db.insert(userRoles).values({ userId: owner.id, roleId: ownerRole[0].id }).onConflictDoNothing();
  }
  await db.insert(systemSettings).values({ key: "ownerBootstrapEmail", value: email }).onConflictDoUpdate({ target: systemSettings.key, set: { value: email, updatedAt: new Date() } });
}
