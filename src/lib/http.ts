import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import { redisRateLimit } from "./redis";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code || "ERROR";
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return json(data ?? { ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof ZodError) {
      return json({ error: error.issues[0]?.message || "Invalid input", code: "VALIDATION" }, 400);
    }
    console.error(error);
    return json({ error: "Unexpected error", code: "UNEXPECTED" }, 500);
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body", "INVALID_JSON");
  }
}

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 64) || "0.0.0.0";
  return req.headers.get("x-real-ip")?.slice(0, 64) || "0.0.0.0";
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}



export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function assertRate(key: string, limit: number, windowMs: number) {
  const redisCount = await redisRateLimit(key, limit, windowMs);
  if (redisCount !== null) {
    if (redisCount > limit) throw new HttpError(429, "Too many requests. Wait a moment and try again.", "RATE_LIMIT");
    return;
  }
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const result = await db.execute(sql`
    insert into rate_limit_buckets (key, count, reset_at, updated_at)
    values (${key}, 1, ${resetAt}, ${now})
    on conflict (key) do update set
      count = case when rate_limit_buckets.reset_at <= ${now} then 1 else rate_limit_buckets.count + 1 end,
      reset_at = case when rate_limit_buckets.reset_at <= ${now} then ${resetAt} else rate_limit_buckets.reset_at end,
      updated_at = ${now}
    returning count
  `);
  const row = (result as unknown as { rows: { count: number }[] }).rows?.[0];
  if (row && Number(row.count) > limit) {
    throw new HttpError(429, "Too many requests. Wait a moment and try again.", "RATE_LIMIT");
  }
}

export async function assertCsrf(req: Request) {
  const header = req.headers.get("x-csrf-token") || "";
  const jar = await cookies();
  const cookie = jar.get("bx_csrf")?.value || "";
  if (!header || !cookie || !safeEqual(header, cookie)) {
    throw new HttpError(403, "Security token mismatch. Refresh the page and try again.", "CSRF");
  }
}

export function cookieSecure(req?: Request) {
  const proto = req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return process.env.NODE_ENV === "production";
}

export async function appBase() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new HttpError(503, "NEXT_PUBLIC_SITE_URL must be configured.", "SITE_URL_CONFIG");
    return "http://localhost:3000";
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new HttpError(500, "NEXT_PUBLIC_SITE_URL is invalid.", "SITE_URL_CONFIG");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new HttpError(500, "Production site URL must use HTTPS.", "SITE_URL_CONFIG");
  }
  return url.origin;
}

export function slugify(input: string) {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug;
}

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function deviceFromUa(ua: string | null) {
  const value = ua || "";
  if (/ipad|tablet/i.test(value)) return "tablet";
  if (/mobi|android|iphone/i.test(value)) return "mobile";
  return "desktop";
}

export function gateToken(websiteId: string, passwordHash: string) {
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? "buildex-local-development-secret-change-me" : "");
  if (secret.length < 32) throw new HttpError(503, "SESSION_SECRET must contain at least 32 characters.", "SESSION_CONFIG");
  return createHmac("sha256", secret).update(`${websiteId}:${passwordHash}`).digest("hex");
}

export async function hasSiteGateAccess(websiteId: string, passwordHash: string | null) {
  if (!passwordHash) return true;
  const jar = await cookies();
  const token = jar.get(`bx_gate_${websiteId}`)?.value || "";
  return Boolean(token) && safeEqual(token, gateToken(websiteId, passwordHash));
}

export function deviceLabel(ua: string | null) {
  const value = ua || "Unknown device";
  if (/edg/i.test(value)) return "Edge";
  if (/chrome/i.test(value)) return "Chrome";
  if (/safari/i.test(value) && !/chrome/i.test(value)) return "Safari";
  if (/firefox/i.test(value)) return "Firefox";
  return "Browser";
}
