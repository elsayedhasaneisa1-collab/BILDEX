import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passwordResets, roles, subscriptionPlans, subscriptions, userRoles, users } from "@/db/schema";
import { assertNotLocked, assertPassword, clearSessionCookie, consumeReset, createSession, getSessionUser, hashPassword, issueReset, recordAttempt, verifyPassword } from "@/lib/auth";
import { ensureSeed } from "@/db/seed";
import { appBase, assertCsrf, assertRate, clientIp, handle, HttpError, readJson } from "@/lib/http";
import { audit, notify } from "@/lib/notify";
import { sendPasswordResetEmail } from "@/lib/email";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/),
  password: z.string().min(10).max(128),
});

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  return handle(async () => {
    await ensureSeed();
    const { action } = await ctx.params;
    const ip = clientIp(req);
    if (action === "logout") {
      await assertCsrf(req);
      const user = await getSessionUser();
      await clearSessionCookie(req);
      if (user) await audit(user.id, "auth.logout", "session", user.id, {}, ip);
      return { ok: true };
    }
    await assertCsrf(req);
    if (action === "register") {
      await assertRate(`register:${ip}`, 8, 60 * 60 * 1000);
      const body = registerSchema.parse(await readJson(req));
      assertPassword(body.password);
      const email = body.email.toLowerCase();
      const clash = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (clash[0]) throw new HttpError(409, "An account with that email already exists.", "EMAIL");
      const nameClash = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1);
      if (nameClash[0]) throw new HttpError(409, "That username is taken.", "USERNAME");
      const passwordHash = await hashPassword(body.password);
      const [user] = await db.insert(users).values({ email, username: body.username, name: body.name, passwordHash, role: "user" }).returning();
      const role = await db.select().from(roles).where(eq(roles.key, "user")).limit(1);
      if (role[0]) await db.insert(userRoles).values({ userId: user.id, roleId: role[0].id });
      const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.key, "free")).limit(1);
      if (plan[0]) {
        await db.insert(subscriptions).values({
          userId: user.id,
          planId: plan[0].id,
          status: "active",
          interval: "year",
          currentPeriodEnd: new Date(Date.now() + 3650 * 86400000),
        });
      }
      await createSession(user.id, req);
      await notify(user.id, "welcome", "Welcome to BUILDEX", "Your Free plan is active. It includes one website.", "/dashboard");
      await audit(user.id, "auth.register", "user", user.id, {}, ip);
      return { ok: true, href: "/dashboard" };
    }
    if (action === "login") {
      await assertRate(`login:${ip}`, 12, 15 * 60 * 1000);
      const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(await readJson(req));
      const email = body.email.toLowerCase();
      await assertNotLocked(email, ip);
      const user = await verifyPassword(email, body.password);
      await recordAttempt(email, ip, Boolean(user));
      if (!user) throw new HttpError(401, "Invalid email or password.", "AUTH");
      await createSession(user.id, req);
      await audit(user.id, "auth.login", "session", user.id, {}, ip);
      return { ok: true };
    }
    if (action === "forgot") {
      await assertRate(`forgot:${ip}`, 6, 60 * 60 * 1000);
      const body = z.object({ email: z.string().email() }).parse(await readJson(req));
      const found = await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);
      if (found[0] && found[0].status === "active" && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
        const token = await issueReset(found[0].id);
        try {
          const resetUrl = `${await appBase()}/reset-password?token=${token}`;
          const sent = await sendPasswordResetEmail(found[0].email, resetUrl);
          if (sent) await audit(found[0].id, "auth.forgot", "user", found[0].id, {}, ip);
          else await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.userId, found[0].id));
        } catch (error) {
          await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.userId, found[0].id));
          console.error("Password reset email could not be sent", error);
        }
      }
      return { ok: true, message: "If the account exists and email delivery is configured, a reset link will be sent. Otherwise contact platform support." };
    }
    if (action === "reset") {
      await assertRate(`reset:${ip}`, 8, 60 * 60 * 1000);
      const body = z.object({ token: z.string().min(20), password: z.string().min(10) }).parse(await readJson(req));
      const userId = await consumeReset(body.token, body.password);
      await audit(userId, "auth.reset", "user", userId, {}, ip);
      return { ok: true };
    }
    throw new HttpError(404, "Unknown auth action.", "NOT_FOUND");
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ action: string }> }) {
  return handle(async () => {
    await ensureSeed();
    const { action } = await ctx.params;
    if (action !== "me") throw new HttpError(404, "Unknown auth action.", "NOT_FOUND");
    const user = await getSessionUser();
    return { user };
  });
}
