import { and, eq, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  auditLogs,
  loginAttempts,
  notifications,
  passwordResets,
  rateLimitBuckets,
  subscriptions,
  systemSettings,
  users,
  websites,
  webhookEvents,
} from "@/db/schema";
import { hashDocument } from "./document";
import { notify } from "./notify";
import { cacheDelete, redisClaimOnce } from "./redis";

let lastRun = 0;

export async function runDueJobs() {
  if (Date.now() - lastRun < 20000) return;
  const distributedLock = await redisClaimOnce("jobs:maintenance", 20);
  if (distributedLock === false) return;
  lastRun = Date.now();
  const now = new Date();

  const due = await db.select({
    id: websites.id,
    ownerId: websites.ownerId,
    name: websites.name,
    slug: websites.slug,
    document: websites.document,
  }).from(websites).where(and(eq(websites.status, "SCHEDULED"), lte(websites.scheduledAt, now))).limit(100);

  for (const site of due) {
    const [published] = await db.update(websites).set({
      status: "PUBLISHED",
      publishedDocument: null,
      publishedHash: hashDocument(site.document),
      publishedAt: now,
      updatedAt: now,
    }).where(and(eq(websites.id, site.id), eq(websites.status, "SCHEDULED"))).returning({ id: websites.id });
    if (published) {
      await cacheDelete(`public-site:${site.slug}`);
      await notify(site.ownerId, "publish", "Scheduled site is live", `${site.name} was published.`, `/s/${site.slug}`);
    }
  }

  const expired = await db.select({ id: websites.id, ownerId: websites.ownerId, name: websites.name, slug: websites.slug })
    .from(websites).where(and(eq(websites.status, "PUBLISHED"), lt(websites.expiresAt, now))).limit(100);
  for (const site of expired) {
    const [expiredSite] = await db.update(websites).set({ status: "EXPIRED", updatedAt: now })
      .where(and(eq(websites.id, site.id), eq(websites.status, "PUBLISHED"))).returning({ id: websites.id });
    if (expiredSite) {
      await cacheDelete(`public-site:${site.slug}`);
      await notify(site.ownerId, "expiry", "Site expired", `${site.name} is no longer public. It was not deleted.`, "/dashboard/websites");
    }
  }

  const ended = await db.select({ id: subscriptions.id, userId: subscriptions.userId }).from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), lt(subscriptions.currentPeriodEnd, now))).limit(100);
  for (const sub of ended) {
    const [expiredSub] = await db.update(subscriptions).set({ status: "expired" })
      .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.status, "active"))).returning({ id: subscriptions.id });
    if (expiredSub) await notify(sub.userId, "subscription", "Subscription ended", "Your plan ended. Sites were kept. Publishing limits now follow Free until you renew.", "/dashboard/subscription");
  }

  const deletions = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.status, "pending_deletion"), lt(users.deletionScheduledAt, now))).limit(50);
  for (const user of deletions) await anonymizeUser(user.id);

  const retentionSetting = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, "analyticsRetentionDays")).limit(1);
  const retentionDays = Math.max(30, Math.min(3650, Number(retentionSetting[0]?.value ?? 400) || 400));
  const analyticsCutoff = new Date(Date.now() - retentionDays * 86400000);
  const thirtyDays = new Date(Date.now() - 30 * 86400000);
  const sevenDays = new Date(Date.now() - 7 * 86400000);
  const ninetyDays = new Date(Date.now() - 90 * 86400000);
  const oneHundredEightyDays = new Date(Date.now() - 180 * 86400000);
  const oneYear = new Date(Date.now() - 365 * 86400000);
  const twoYears = new Date(Date.now() - 730 * 86400000);

  await Promise.all([
    db.delete(analyticsEvents).where(lt(analyticsEvents.createdAt, analyticsCutoff)),
    db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, new Date(Date.now() - 86400000))),
    db.delete(loginAttempts).where(lt(loginAttempts.createdAt, thirtyDays)),
    db.delete(passwordResets).where(or(lt(passwordResets.expiresAt, sevenDays), lt(passwordResets.createdAt, sevenDays))),
    db.delete(notifications).where(or(and(isNotNull(notifications.readAt), lt(notifications.readAt, oneHundredEightyDays)), lt(notifications.createdAt, oneYear))),
    db.delete(webhookEvents).where(lt(webhookEvents.createdAt, ninetyDays)),
    db.delete(auditLogs).where(lt(auditLogs.createdAt, twoYears)),
  ]);
}

export async function anonymizeUser(userId: string) {
  const stamp = userId.slice(0, 8);
  await db.update(users).set({
    email: `deleted-${stamp}@deleted.buildex`,
    username: `deleted-${stamp}`,
    name: "Deleted account",
    passwordHash: `deleted-${stamp}-${Date.now()}`,
    avatarUrl: null,
    bio: "",
    headline: "",
    status: "deleted",
    deletionScheduledAt: null,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  await db.delete(websites).where(eq(websites.ownerId, userId));
  await db.execute(sql`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`);
}
