import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  auditLogs,
  coupons,
  designerProfiles,
  payments,
  payoutRequests,
  permissions,
  reports,
  rolePermissions,
  roles,
  subscriptionPlans,
  subscriptions,
  supportMessages,
  supportTickets,
  systemSettings,
  teamApplications,
  templateCategories,
  templateReviews,
  templates,
  userRoles,
  users,
  websites,
} from "@/db/schema";
import { ALL_PERMISSIONS, ROLE_DEFAULTS, featuresFor } from "./constants";
import { HttpError } from "./http";
import { audit, notify } from "./notify";
import { assertCan, can, countOwners } from "./permissions";
import { reviewTemplate } from "./templates";
import { approveManualPayment, rejectManualPayment, reviewPayout, refundPayment } from "./billing";
import type { PlanFeatures, PlanKey, SessionUser } from "./types";
import { cacheDelete } from "./redis";

const STAFF = ["reviewer", "support", "admin", "owner"];

export function assertStaff(user: SessionUser) {
  if (!STAFF.includes(user.role) && !can(user, "templates.review") && !can(user, "support.manage")) {
    throw new HttpError(403, "Command Center is for staff roles.", "FORBIDDEN");
  }
}

export async function loadAdmin(user: SessionUser, section: string) {
  assertStaff(user);
  if (section === "overview" || section === "") {
    const [userCount, siteCount, templateCount, openTickets, pendingTemplates, sales] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(users),
      db.select({ n: sql<number>`count(*)::int` }).from(websites),
      db.select({ n: sql<number>`count(*)::int` }).from(templates).where(eq(templates.status, "PUBLISHED")),
      db.select({ n: sql<number>`count(*)::int` }).from(supportTickets).where(eq(supportTickets.status, "open")),
      db.select({ n: sql<number>`count(*)::int` }).from(templates).where(sql`${templates.status} in ('PENDING','UNDER_REVIEW') or ${templates.pendingDocument} is not null or exists (select 1 from template_versions tv where tv.template_id = ${templates.id} and tv.status = 'PENDING')`),
      db.select({ n: sql<number>`coalesce(sum(${payments.amount}),0)::int` }).from(payments).where(eq(payments.status, "succeeded")),
    ]);
    return {
      users: userCount[0]?.n || 0,
      websites: siteCount[0]?.n || 0,
      publishedTemplates: templateCount[0]?.n || 0,
      openTickets: openTickets[0]?.n || 0,
      pendingTemplates: pendingTemplates[0]?.n || 0,
      revenue: sales[0]?.n || 0,
    };
  }
  if (section === "users") {
    assertCan(user, "users.manage");
    return db.select({ id: users.id, name: users.name, email: users.email, username: users.username, role: users.role, status: users.status, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(100);
  }
  if (section === "designers") {
    assertCan(user, "designers.manage");
    return db.select({
      user: { id: users.id, name: users.name, email: users.email, username: users.username, role: users.role, status: users.status, avatarUrl: users.avatarUrl, headline: users.headline, createdAt: users.createdAt },
      profile: designerProfiles,
    }).from(users).leftJoin(designerProfiles, eq(designerProfiles.userId, users.id)).where(sql`${users.role} = 'designer' or ${designerProfiles.userId} is not null`).limit(100);
  }
  if (section === "team") {
    assertCan(user, "team.manage");
    const applications = await db.select().from(teamApplications).orderBy(desc(teamApplications.createdAt)).limit(50);
    const roleRows = await db.select().from(roles);
    const perms = await db.select().from(permissions);
    const links = await db.select().from(rolePermissions);
    return { applications, roles: roleRows, permissions: perms, links };
  }
  if (section === "templates" || section === "reviews") {
    assertCan(user, "templates.review");
    const rows = await db.select({
      template: {
        id: templates.id,
        name: templates.name,
        slug: templates.slug,
        status: templates.status,
        tier: templates.tier,
        price: templates.price,
        updatedAt: templates.updatedAt,
        hasPendingChanges: sql<boolean>`${templates.pendingDocument} is not null or exists (select 1 from template_versions tv where tv.template_id = ${templates.id} and tv.status = 'PENDING')`,
      },
      designer: { name: users.name, username: users.username },
    }).from(templates).innerJoin(users, eq(templates.designerId, users.id)).orderBy(desc(templates.updatedAt)).limit(80);
    const reviews = await db.select().from(templateReviews).orderBy(desc(templateReviews.createdAt)).limit(40);
    return { templates: rows, reviews };
  }
  if (section === "websites") {
    assertCan(user, "websites.moderate");
    return db.select({
      site: {
        id: websites.id,
        name: websites.name,
        slug: websites.slug,
        status: websites.status,
        category: websites.category,
        updatedAt: websites.updatedAt,
        publishedAt: websites.publishedAt,
      },
      owner: { name: users.name, email: users.email },
    }).from(websites).innerJoin(users, eq(websites.ownerId, users.id)).orderBy(desc(websites.updatedAt)).limit(80);
  }
  if (section === "subscriptions") {
    assertCan(user, "subscriptions.manage");
    return db.select({ sub: subscriptions, user: { name: users.name, email: users.email }, plan: subscriptionPlans }).from(subscriptions).innerJoin(users, eq(subscriptions.userId, users.id)).innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id)).orderBy(desc(subscriptions.createdAt)).limit(80);
  }
  if (section === "plans") {
    assertCan(user, "plans.manage");
    return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
  }
  if (section === "payments" || section === "marketplace") {
    assertCan(user, "payments.manage");
    return db.select({ payment: payments, user: { name: users.name, email: users.email } }).from(payments).innerJoin(users, eq(payments.userId, users.id)).orderBy(desc(payments.createdAt)).limit(80);
  }
  if (section === "payouts") {
    assertCan(user, "payouts.manage");
    return db.select({ payout: payoutRequests, user: { name: users.name, email: users.email } }).from(payoutRequests).innerJoin(users, eq(payoutRequests.designerId, users.id)).orderBy(desc(payoutRequests.createdAt)).limit(80);
  }
  if (section === "reports") {
    assertCan(user, "reports.manage");
    return db.select().from(reports).orderBy(desc(reports.createdAt)).limit(80);
  }
  if (section === "support") {
    assertCan(user, "support.manage");
    return db.select({ ticket: supportTickets, user: { name: users.name, email: users.email } }).from(supportTickets).innerJoin(users, eq(supportTickets.userId, users.id)).orderBy(desc(supportTickets.updatedAt)).limit(80);
  }
  if (section === "analytics") {
    assertCan(user, "analytics.read");
    const events = await db.select({ n: sql<number>`count(*)::int` }).from(analyticsEvents).where(eq(analyticsEvents.eventType, "view"));
    const byDevice = await db.select({ device: analyticsEvents.device, n: sql<number>`count(*)::int` }).from(analyticsEvents).where(eq(analyticsEvents.eventType, "view")).groupBy(analyticsEvents.device);
    return { events: events[0]?.n || 0, byDevice };
  }
  if (section === "coupons") {
    assertCan(user, "coupons.manage");
    return db.select().from(coupons).orderBy(desc(coupons.createdAt));
  }
  if (section === "notifications") {
    assertCan(user, "notifications.broadcast");
    return db.select().from(systemSettings).where(eq(systemSettings.key, "announcement"));
  }
  if (section === "audit") {
    assertCan(user, "audit.read");
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(120);
  }
  if (section === "settings" || section === "maintenance") {
    assertCan(user, section === "maintenance" ? "maintenance.manage" : "settings.manage");
    return db.select().from(systemSettings);
  }
  throw new HttpError(404, "Unknown section.", "NOT_FOUND");
}

export async function adminAct(user: SessionUser, body: Record<string, unknown>, ip: string) {
  assertStaff(user);
  const action = String(body.action || "");
  if (action === "user.role") {
    assertCan(user, "users.manage");
    const role = String(body.role || "");
    if (!["user", "designer", "reviewer", "support", "admin", "owner"].includes(role)) throw new HttpError(400, "Unknown role.", "ROLE");
    if (role === "owner" && user.role !== "owner") throw new HttpError(403, "Only an owner can grant owner.", "OWNER");
    if (body.userId === user.id) throw new HttpError(403, "You cannot change your own role.", "SELF");
    const target = await db.select().from(users).where(eq(users.id, String(body.userId))).limit(1);
    if (!target[0]) throw new HttpError(404, "User not found.", "NOT_FOUND");
    if (target[0].role === "owner" && user.role !== "owner") throw new HttpError(403, "You cannot change an owner.", "OWNER");
    if (target[0].role === "owner" && role !== "owner" && (await countOwners()) < 2) throw new HttpError(400, "The last owner cannot be removed.", "OWNER");
    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, target[0].id));
    const roleRow = await db.select().from(roles).where(eq(roles.key, role)).limit(1);
    if (roleRow[0]) {
      await db.delete(userRoles).where(eq(userRoles.userId, target[0].id));
      await db.insert(userRoles).values({ userId: target[0].id, roleId: roleRow[0].id }).onConflictDoNothing();
    }
    if (role === "designer") await ensureProfile(target[0].id, false);
    await audit(user.id, "user.role", "user", target[0].id, { role }, ip);
    await notify(target[0].id, "role", "Role updated", `Your platform role is now ${role}. You cannot grant this to yourself.`, "/dashboard/settings");
    return { ok: true };
  }
  if (action === "user.status") {
    assertCan(user, "users.manage");
    const status = String(body.status || "");
    if (!["active", "suspended"].includes(status)) throw new HttpError(400, "Unknown status.", "STATUS");
    if (body.userId === user.id) throw new HttpError(403, "You cannot suspend yourself.", "SELF");
    await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, String(body.userId)));
    await db.execute(sql`update sessions set revoked_at = now() where user_id = ${String(body.userId)} and ${status} = 'suspended'`);
    await audit(user.id, "user.status", "user", String(body.userId), { status }, ip);
    return { ok: true };
  }
  if (action === "designer.verify") {
    assertCan(user, "designers.manage");
    await db.update(designerProfiles).set({ verified: Boolean(body.verified) }).where(eq(designerProfiles.userId, String(body.userId)));
    await audit(user.id, "designer.verify", "user", String(body.userId), { verified: Boolean(body.verified) }, ip);
    return { ok: true };
  }
  if (action === "template.review") {
    return reviewTemplate(user, String(body.templateId), String(body.decision) as "APPROVED" | "PUBLISHED" | "REJECTED" | "SUSPENDED" | "UNDER_REVIEW", String(body.reason || ""));
  }
  if (action === "website.unpublish") {
    assertCan(user, "websites.moderate");
    await db.update(websites).set({ status: "UNPUBLISHED", updatedAt: new Date() }).where(eq(websites.id, String(body.websiteId)));
    await audit(user.id, "website.moderate", "website", String(body.websiteId), { reason: String(body.reason || "") }, ip);
    return { ok: true };
  }
  if (action === "plan.save") {
    assertCan(user, "plans.manage");
    const key = String(body.key || "") as PlanKey;
    if (!["free", "plus", "pro", "designer"].includes(key)) throw new HttpError(400, "Unknown plan.", "PLAN");
    const features = { ...featuresFor(key), ...(body.features as Partial<PlanFeatures>) };
    await db
      .update(subscriptionPlans)
      .set({
        name: String(body.name || key),
        description: String(body.description || ""),
        priceMonthly: Number(body.priceMonthly) || 0,
        priceQuarterly: Number(body.priceQuarterly) || 0,
        priceYearly: Number(body.priceYearly) || 0,
        active: body.active !== false,
        features,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlans.key, key));
    await audit(user.id, "plan.save", "plan", key, { features }, ip);
    return { ok: true };
  }
  if (action === "coupon.save") {
    assertCan(user, "coupons.manage");
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) throw new HttpError(400, "Coupon code must be 3-24 letters or numbers.", "COUPON");
    await db
      .insert(coupons)
      .values({
        code,
        percentOff: Number(body.percentOff) || 0,
        amountOff: Number(body.amountOff) || 0,
        planKey: body.planKey ? String(body.planKey) : null,
        maxUses: body.maxUses ? Number(body.maxUses) : null,
        endsAt: body.endsAt ? new Date(String(body.endsAt)) : null,
        active: body.active !== false,
      })
      .onConflictDoUpdate({
        target: coupons.code,
        set: {
          percentOff: Number(body.percentOff) || 0,
          amountOff: Number(body.amountOff) || 0,
          active: body.active !== false,
          maxUses: body.maxUses ? Number(body.maxUses) : null,
        },
      });
    await audit(user.id, "coupon.save", "coupon", code, {}, ip);
    return { ok: true };
  }
  if (action === "payout.review") {
    assertCan(user, "payouts.manage");
    return reviewPayout(user, String(body.id), String(body.decision) as "approved" | "rejected" | "paid", String(body.note || ""));
  }
  if (action === "payment.refund") {
    assertCan(user, "payments.refund");
    return refundPayment(user, String(body.paymentId), String(body.reason || ""));
  }
  if (action === "payment.approve") {
    assertCan(user, "payments.manage");
    return approveManualPayment(user, String(body.paymentId));
  }
  if (action === "payment.reject") {
    assertCan(user, "payments.manage");
    return rejectManualPayment(user, String(body.paymentId), String(body.reason || ""));
  }
  if (action === "report.resolve") {
    assertCan(user, "reports.manage");
    await db.update(reports).set({ status: String(body.status || "resolved"), resolvedBy: user.id, resolvedAt: new Date() }).where(eq(reports.id, String(body.id)));
    await audit(user.id, "report.resolve", "report", String(body.id), {}, ip);
    return { ok: true };
  }
  if (action === "ticket.reply") {
    assertCan(user, "support.manage");
    const ticketId = String(body.ticketId);
    const message = String(body.message || "").trim();
    if (message.length < 1) throw new HttpError(400, "Write a reply.", "TICKET");
    await db.insert(supportMessages).values({ ticketId, authorId: user.id, body: message.slice(0, 4000) });
    const status = String(body.status || "pending");
    await db.update(supportTickets).set({ status, updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (ticket[0]) await notify(ticket[0].userId, "support", "Support replied", message.slice(0, 140), `/dashboard/support/${ticketId}`);
    return { ok: true };
  }
  if (action === "broadcast") {
    assertCan(user, "notifications.broadcast");
    const title = String(body.title || "").trim().slice(0, 120);
    const text = String(body.body || "").trim().slice(0, 500);
    if (title.length < 2) throw new HttpError(400, "Title is required.", "NOTICE");
    const people = await db.select({ id: users.id }).from(users).where(eq(users.status, "active")).limit(500);
    for (const person of people) await notify(person.id, "platform", title, text, "/updates");
    await db.insert(systemSettings).values({ key: "announcement", value: { title, body: text, at: new Date().toISOString() } }).onConflictDoUpdate({ target: systemSettings.key, set: { value: { title, body: text, at: new Date().toISOString() }, updatedAt: new Date() } });
    await audit(user.id, "broadcast", "notification", null, { title, recipients: people.length }, ip);
    return { ok: true, recipients: people.length };
  }
  if (action === "settings") {
    assertCan(user, "settings.manage");
    const key = String(body.key || "");
    if (!["commissionRate", "platformName", "analyticsRetentionDays"].includes(key)) throw new HttpError(400, "Setting cannot be changed here.", "SETTING");
    const numericValue = Number(body.value);
    const value: string | number = key === "commissionRate" || key === "analyticsRetentionDays" ? numericValue : String(body.value || "");
    if ((key === "commissionRate" && (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 80)) || (key === "analyticsRetentionDays" && (!Number.isInteger(numericValue) || numericValue < 30 || numericValue > 3650))) {
      throw new HttpError(400, "Setting value is outside the allowed range.", "SETTING");
    }
    await db.insert(systemSettings).values({ key, value }).onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
    await audit(user.id, "settings.update", "setting", key, { value: value as never }, ip);
    return { ok: true };
  }
  if (action === "payment.contact") {
    assertCan(user, "settings.manage");
    const phone = String(body.phone || "").replace(/[^0-9]/g, "");
    const instructions = String(body.instructions || "").trim().slice(0, 500);
    if (phone.length < 8 || phone.length > 15) throw new HttpError(400, "Enter a WhatsApp number in international format, including its country code.", "PAYMENT_CONTACT");
    const value = { phone: `+${phone}`, instructions };
    await db.insert(systemSettings).values({ key: "paymentContact", value }).onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
    await audit(user.id, "payment.contact.update", "setting", "paymentContact", { phone: value.phone }, ip);
    return { ok: true };
  }
  if (action === "maintenance") {
    assertCan(user, "maintenance.manage");
    const enabled = body.enabled === true || body.enabled === "true";
    await db.insert(systemSettings).values({ key: "maintenance", value: { enabled, message: String(body.message || "") } }).onConflictDoUpdate({ target: systemSettings.key, set: { value: { enabled, message: String(body.message || "") }, updatedAt: new Date() } });
    await audit(user.id, "maintenance", "setting", "maintenance", { enabled }, ip);
    return { ok: true };
  }
  if (action === "application.status") {
    assertCan(user, "team.manage");
    await db.update(teamApplications).set({ status: String(body.status || "reviewed") }).where(eq(teamApplications.id, String(body.id)));
    await audit(user.id, "application.status", "application", String(body.id), { status: body.status }, ip);
    return { ok: true };
  }
  if (action === "permission.toggle") {
    assertCan(user, "team.manage");
    if (user.role !== "owner" && user.role !== "admin") throw new HttpError(403, "Only admin or owner can edit permissions.", "FORBIDDEN");
    const roleKey = String(body.role || "");
    const permKey = String(body.permission || "");
    if (roleKey === "owner") throw new HttpError(400, "Owner permissions are fixed in code so the platform cannot be locked out.", "OWNER");
    if (!ALL_PERMISSIONS.includes(permKey) || !ROLE_DEFAULTS[roleKey]) throw new HttpError(400, "Unknown permission.", "PERMISSION");
    const role = await db.select().from(roles).where(eq(roles.key, roleKey)).limit(1);
    const perm = await db.select().from(permissions).where(eq(permissions.key, permKey)).limit(1);
    if (!role[0] || !perm[0]) throw new HttpError(404, "Role or permission missing.", "NOT_FOUND");
    const existing = await db.select().from(rolePermissions).where(and(eq(rolePermissions.roleId, role[0].id), eq(rolePermissions.permissionId, perm[0].id))).limit(1);
    if (existing[0]) await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, role[0].id), eq(rolePermissions.permissionId, perm[0].id)));
    else await db.insert(rolePermissions).values({ roleId: role[0].id, permissionId: perm[0].id });
    await audit(user.id, "permission.toggle", "role", roleKey, { permission: permKey, granted: !existing[0] }, ip);
    return { ok: true };
  }
  if (action === "category.save") {
    assertCan(user, "templates.review");
    const key = String(body.key || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    if (key.length < 2) throw new HttpError(400, "Category key is required.", "CATEGORY");
    await db.insert(templateCategories).values({ key, group: String(body.group || "CUSTOM"), name: String(body.name || key), description: String(body.description || ""), sortOrder: Number(body.sortOrder) || 0 }).onConflictDoUpdate({ target: templateCategories.key, set: { name: String(body.name || key), description: String(body.description || ""), group: String(body.group || "CUSTOM") } });
    await cacheDelete("templates:categories");
    await audit(user.id, "category.save", "category", key, {}, ip);
    return { ok: true };
  }
  throw new HttpError(400, "Unknown admin action.", "ACTION");
}

export async function ensureProfile(userId: string, official = false) {
  const existing = await db.select().from(designerProfiles).where(eq(designerProfiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const membershipId = `BDX-${new Date().getFullYear()}-${userId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const [row] = await db.insert(designerProfiles).values({ userId, membershipId, skills: [], specialties: [], official, verified: official }).returning();
  return row;
}

export async function maintenanceOn() {
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, "maintenance")).limit(1);
  const value = rows[0]?.value as { enabled?: boolean; message?: string } | undefined;
  return { enabled: Boolean(value?.enabled), message: value?.message || "BUILDEX is in maintenance. Staff can still sign in." };
}
