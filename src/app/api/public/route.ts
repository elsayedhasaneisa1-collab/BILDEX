import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { websites } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { addGuestbook, listGuestbook, recordSubmission } from "@/lib/websites";
import { assertRate, clientIp, cookieSecure, gateToken, handle, hasSiteGateAccess, HttpError, readJson, sha256 } from "@/lib/http";
import { deviceFromUa } from "@/lib/http";
import { analyticsEvents } from "@/db/schema";
import { redisClaimOnce, redisReleaseClaim } from "@/lib/redis";

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    const ip = clientIp(req);
    await assertRate(`public:${ip}`, 40, 60 * 1000);
    const body = await readJson<Record<string, unknown>>(req);
    const intent = String(body.intent || "");
    if (intent === "gate") {
      const siteRows = await db.select({ id: websites.id, passwordHash: websites.passwordHash }).from(websites).where(eq(websites.slug, String(body.slug || ""))).limit(1);
      const site = siteRows[0];
      if (!site || !site.passwordHash) throw new HttpError(400, "This site is not locked.", "GATE");
      const ok = await bcrypt.compare(String(body.password || ""), site.passwordHash);
      if (!ok) throw new HttpError(401, "Wrong site password.", "GATE");
      const { cookies } = await import("next/headers");
      const jar = await cookies();
      jar.set(`bx_gate_${site.id}`, gateToken(site.id, site.passwordHash), {
        httpOnly: true,
        sameSite: "lax",
        secure: cookieSecure(req),
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return { ok: true };
    }
    const site = body.websiteId ? (await db.select({ id: websites.id, status: websites.status, passwordHash: websites.passwordHash }).from(websites).where(eq(websites.id, String(body.websiteId))).limit(1))[0] : null;
    if (!site || site.status !== "PUBLISHED") throw new HttpError(404, "Site is not public.", "NOT_FOUND");
    if (!(await hasSiteGateAccess(site.id, site.passwordHash))) throw new HttpError(401, "Enter the site password before using its forms or guestbook.", "SITE_LOCKED");
    if (intent === "form") {
      const payload = (body.payload || {}) as Record<string, string>;
      await recordSubmission(site.id, String(body.pageSlug || "home"), String(body.elementId || ""), payload);
      return { ok: true };
    }
    if (intent === "guestbook") {
      await addGuestbook(site.id, String(body.elementId || ""), String(body.name || ""), String(body.message || ""));
      return { entries: await listGuestbook(site.id, String(body.elementId || "")) };
    }
    if (intent === "guestbook-list") return { entries: await listGuestbook(site.id, String(body.elementId || "")) };
    if (intent === "view" || intent === "duration") {
      const ua = req.headers.get("user-agent") || "";
      const day = new Date().toISOString().slice(0, 10);
      const pageSlug = String(body.pageSlug || "home").slice(0, 60);
      const visitorHash = sha256(`${ip}|${ua}|${site.id}|${day}`);
      const eventType = intent === "duration" ? "duration" : "view";
      const eventKey = sha256(`${site.id}|${pageSlug}|${visitorHash}|${day}|${eventType}`);
      const claim = eventType === "view" ? await redisClaimOnce(`analytics:${eventKey}`, 36 * 60 * 60) : null;
      if (claim === false) return { ok: true, deduplicated: true };
      try {
        await db.insert(analyticsEvents).values({
          websiteId: site.id,
          pageSlug,
          visitorHash,
          source: sourceFrom(req.headers.get("referer")),
          device: deviceFromUa(ua),
          eventType,
          eventKey,
          durationMs: body.durationMs ? Math.min(Number(body.durationMs) || 0, 30 * 60 * 1000) : null,
        }).onConflictDoUpdate({
          target: analyticsEvents.eventKey,
          set: { durationMs: sql`greatest(coalesce(${analyticsEvents.durationMs}, 0), coalesce(excluded.duration_ms, 0))` },
        });
      } catch (error) {
        if (claim === true) await redisReleaseClaim(`analytics:${eventKey}`);
        throw error;
      }
      return { ok: true, deduplicated: false };
    }
    throw new HttpError(400, "Unknown public action.", "ACTION");
  });
}

function sourceFrom(referer: string | null) {
  if (!referer) return "direct";
  try {
    return new URL(referer).host.slice(0, 80);
  } catch {
    return "direct";
  }
}
