import bcrypt from "bcryptjs";
import { and, eq, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { designerProfiles, sessions, users, websites } from "@/db/schema";
import { assertPassword, clearSessionCookie, hashPassword, requireUser } from "@/lib/auth";
import { ensureSeed } from "@/db/seed";
import { assertCsrf, clientIp, handle, HttpError, readJson, sha256 } from "@/lib/http";
import { anonymizeUser } from "@/lib/jobs";
import { audit } from "@/lib/notify";


function safeProfileImage(value: string | null | undefined) {
  const input = value?.trim() || "";
  if (!input) return null;
  if (input.startsWith("/") && !input.startsWith("//") && !input.includes("\0")) return input.slice(0, 300);
  try {
    const url = new URL(input);
    if (url.protocol === "https:") return url.toString().slice(0, 300);
  } catch {
    throw new HttpError(400, "Profile image must be an HTTPS URL or a same-site path.", "PROFILE_IMAGE");
  }
  throw new HttpError(400, "Profile image must be an HTTPS URL or a same-site path.", "PROFILE_IMAGE");
}

export async function GET(req: Request) {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const current = sha256((await cookies()).get("bx_session")?.value || "");
    const rows = await db.select().from(sessions).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    return {
      user,
      sessions: rows.map((row) => ({
        id: row.id,
        deviceLabel: row.deviceLabel,
        ip: row.ip,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        current: row.tokenHash === current,
      })),
    };
    void req;
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const body = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/).optional(),
      bio: z.string().max(600).optional(),
      headline: z.string().max(120).optional(),
      avatarUrl: z.string().max(300).nullable().optional(),
      locale: z.enum(["ar", "en"]).optional(),
      designerProfile: z.object({
        coverUrl: z.string().max(300).optional(),
        skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
        specialties: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
        socialLinks: z.record(z.string(), z.string().max(300)).optional(),
        visibility: z.record(z.string(), z.boolean()).optional(),
      }).optional(),
    }).parse(await readJson(req));
    if (body.username && body.username !== user.username) {
      const clash = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1);
      if (clash[0]) throw new HttpError(409, "That username is taken.", "USERNAME");
    }
    const { designerProfile, ...accountFields } = body;
    if (designerProfile && !(user.features.canCreateTemplates || ["designer", "reviewer", "support", "admin", "owner"].includes(user.role))) {
      throw new HttpError(403, "Designer profile settings require designer access.", "DESIGNER");
    }
    const updateFields = { ...accountFields, ...(accountFields.avatarUrl !== undefined ? { avatarUrl: safeProfileImage(accountFields.avatarUrl) } : {}), updatedAt: new Date() };
    await db.update(users).set(updateFields).where(eq(users.id, user.id));
    if (designerProfile) {
      const safeCoverUrl = safeProfileImage(designerProfile.coverUrl);
      const current = await db.select().from(designerProfiles).where(eq(designerProfiles.userId, user.id)).limit(1);
      const membershipId = current[0]?.membershipId || `BDX-${new Date().getFullYear()}-${user.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
      const socialLinks = Object.fromEntries((Object.entries(designerProfile.socialLinks || {}) as [string, string][]).filter(([key, value]) => /^[a-zA-Z0-9_-]{2,24}$/.test(key) && value.trim().length > 0).map(([key, value]) => [key, value.trim().slice(0, 300)]));
      const visibility = Object.fromEntries(Object.entries(designerProfile.visibility || {}).filter(([key]) => ["bio", "skills", "socialLinks", "posts", "portfolio"].includes(key)));
      await db.insert(designerProfiles).values({
        userId: user.id,
        membershipId,
        coverUrl: safeCoverUrl,
        skills: designerProfile.skills || [],
        specialties: designerProfile.specialties || [],
        socialLinks,
        visibility,
        verified: current[0]?.verified || false,
        official: current[0]?.official || false,
      }).onConflictDoUpdate({
        target: designerProfiles.userId,
        set: {
          coverUrl: safeCoverUrl,
          skills: designerProfile.skills || [],
          specialties: designerProfile.specialties || [],
          socialLinks,
          visibility,
        },
      });
    }
    await audit(user.id, "account.update", "user", user.id, {}, clientIp(req));
    return { ok: true };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const body = await readJson<{ intent?: string; current?: string; password?: string; sessionId?: string; confirm?: string }>(req);
    if (body.intent === "password") {
      assertPassword(body.password || "");
      const row = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      const ok = await bcrypt.compare(body.current || "", row[0]?.passwordHash || "");
      if (!ok) throw new HttpError(400, "Current password is wrong.", "PASSWORD");
      await db.update(users).set({ passwordHash: await hashPassword(body.password || ""), updatedAt: new Date() }).where(eq(users.id, user.id));
      const token = (await cookies()).get("bx_session")?.value || "";
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), ne(sessions.tokenHash, sha256(token))));
      await audit(user.id, "account.password", "user", user.id, {}, clientIp(req));
      return { ok: true };
    }
    if (body.intent === "revoke") {
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, body.sessionId || ""), eq(sessions.userId, user.id)));
      return { ok: true };
    }
    if (body.intent === "revoke-others") {
      const token = (await cookies()).get("bx_session")?.value || "";
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), ne(sessions.tokenHash, sha256(token))));
      return { ok: true };
    }
    if (body.intent === "schedule-delete") {
      if (body.confirm !== user.email) throw new HttpError(400, "Type your email to schedule deletion.", "CONFIRM");
      const when = new Date(Date.now() + 7 * 86400000);
      await db.update(users).set({ status: "pending_deletion", deletionScheduledAt: when }).where(eq(users.id, user.id));
      await db.update(websites).set({ status: "UNPUBLISHED" }).where(eq(websites.ownerId, user.id));
      await audit(user.id, "account.schedule-delete", "user", user.id, { when: when.toISOString() }, clientIp(req));
      return { ok: true, deletionScheduledAt: when.toISOString() };
    }
    if (body.intent === "cancel-delete") {
      await db.update(users).set({ status: "active", deletionScheduledAt: null }).where(eq(users.id, user.id));
      return { ok: true };
    }
    if (body.intent === "delete-now") {
      if (body.confirm !== user.email) throw new HttpError(400, "Type your email to delete the account.", "CONFIRM");
      await anonymizeUser(user.id);
      await clearSessionCookie(req);
      await audit(user.id, "account.delete", "user", user.id, {}, clientIp(req));
      return { ok: true };
    }
    throw new HttpError(400, "Unknown account action.", "ACTION");
  });
}


