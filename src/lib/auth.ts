import bcrypt from "bcryptjs";
import { and, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { loginAttempts, passwordResets, sessions, users } from "@/db/schema";
import { getPlanForUser, loadPermissions } from "./permissions";
import { cookieSecure, deviceLabel, HttpError, randomToken, sha256 } from "./http";
import type { SessionUser } from "./types";
import { cacheDelete, cacheRemember } from "./redis";

const DUMMY_HASH = "$2b$10$KDXxavl.rp/.4fdpBdyuhuDcSW4GbIE6XFd8.eJZJT1hMoe0.34ZO";
const SESSION_DAYS = 14;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function assertPassword(password: string) {
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    throw new HttpError(400, "Use at least 10 characters with a letter and a number.", "PASSWORD_WEAK");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, "Use at least 10 characters with a letter and a number.", "PASSWORD_WEAK");
  }
}

export async function createSession(userId: string, req: Request) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  const ua = req.headers.get("user-agent");
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: ua?.slice(0, 240) || null,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || null,
    deviceLabel: deviceLabel(ua),
    expiresAt: expires,
  });
  const jar = await cookies();
  jar.set("bx_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(req),
    path: "/",
    expires,
  });
  return token;
}

export async function clearSessionCookie(req?: Request) {
  const jar = await cookies();
  const token = jar.get("bx_session")?.value;
  if (token) await cacheDelete(`session-user:${sha256(token)}`);
  jar.set("bx_session", "", { httpOnly: true, sameSite: "lax", secure: cookieSecure(req), path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get("bx_session")?.value;
  if (!token) return null;
  return cacheRemember(`session-user:${sha256(token)}`, 10, async () => {
    const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.user.status === "deleted" || row.user.status === "suspended") return null;
  if (Date.now() - row.session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.session.id));
  }
  const permissions = await loadPermissions(row.user.id, row.user.role);
  const plan = await getPlanForUser(row.user.id);
  return {
    id: row.user.id,
    email: row.user.email,
    username: row.user.username,
    name: row.user.name,
    avatarUrl: row.user.avatarUrl,
    bio: row.user.bio,
    headline: row.user.headline,
    role: row.user.role,
    status: row.user.status,
    locale: row.user.locale,
    createdAt: row.user.createdAt.toISOString(),
    permissions,
    planKey: plan.planKey,
    features: plan.features,
    subscriptionStatus: plan.status,
    periodEnd: plan.periodEnd,
  };
  });
}
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Sign in to continue.", "AUTH");
  return user;
}

export async function recordAttempt(email: string, ip: string, success: boolean) {
  await db.insert(loginAttempts).values({ email: email.toLowerCase(), ip, success });
}

export async function assertNotLocked(email: string, ip: string) {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const rows = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(and(or(eq(loginAttempts.email, email.toLowerCase()), eq(loginAttempts.ip, ip)), eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since)))
    .limit(8);
  if (rows.length >= 8) throw new HttpError(429, "Too many sign-in attempts. Try again in 15 minutes.", "LOCKED");
}

export async function verifyPassword(email: string, password: string) {
  const found = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  const user = found[0];
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok || user.status === "deleted" || user.status === "suspended") return null;
  return user;
}

export async function issueReset(userId: string) {
  const token = randomToken(32);
  await db.update(passwordResets).set({ usedAt: new Date() }).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  await db.insert(passwordResets).values({
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return token;
}

export async function consumeReset(token: string, password: string) {
  assertPassword(password);
  const passwordHash = await hashPassword(password);
  const tokenHash = sha256(token);
  const userId = await db.transaction(async (tx) => {
    const found = await tx.select().from(passwordResets).where(eq(passwordResets.tokenHash, tokenHash)).limit(1);
    const candidate = found[0];
    if (!candidate) throw new HttpError(400, "This reset link is invalid or expired.", "RESET_INVALID");
    await tx.execute(sql`select id from password_resets where id = ${candidate.id} for update`);
    const rows = await tx.select().from(passwordResets).where(and(eq(passwordResets.id, candidate.id), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date()))).limit(1);
    const row = rows[0];
    if (!row) throw new HttpError(400, "This reset link is invalid or expired.", "RESET_INVALID");
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, row.userId));
    return row.userId;
  });
  return userId;
}
