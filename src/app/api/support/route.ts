import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { supportMessages, supportTickets, teamApplications, notifications } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { getSessionUser, requireUser } from "@/lib/auth";
import { assertCsrf, assertRate, clientIp, handle, HttpError, readJson } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const tickets = await db.select().from(supportTickets).where(eq(supportTickets.userId, user.id)).orderBy(desc(supportTickets.updatedAt));
    const notes = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(40);
    return { tickets, notifications: notes };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const body = await readJson<Record<string, string>>(req);
    if (body.intent === "contact" || body.intent === "join") {
      await assertRate(`public-form:${clientIp(req)}`, 8, 60 * 60 * 1000);
      if (body.intent === "join") {
        if (!body.name || !body.email || !body.message) throw new HttpError(400, "Name, email, and message are required.", "FORM");
        await db.insert(teamApplications).values({
          name: body.name.slice(0, 80),
          email: body.email.slice(0, 160),
          roleInterest: (body.roleInterest || "Designer").slice(0, 40),
          portfolioUrl: body.portfolioUrl?.slice(0, 200) || null,
          message: body.message.slice(0, 2000),
        });
        return { ok: true };
      }
    }
    const user = body.intent === "contact" ? await getSessionUser() : await requireUser();
    if (body.intent === "contact") {
      if (!body.email || !body.message || !body.subject) throw new HttpError(400, "Subject, email, and message are required.", "FORM");
      if (!user) {
        await db.insert(teamApplications).values({
          name: (body.name || "Visitor").slice(0, 80),
          email: body.email.slice(0, 160),
          roleInterest: "contact",
          message: `${body.subject}\n\n${body.message}`.slice(0, 2000),
        });
        return { ok: true, stored: "desk" };
      }
    }
    if (!user) throw new HttpError(401, "Sign in to open a ticket.", "AUTH");
    if (body.intent === "reply") {
      const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, body.ticketId)).limit(1);
      if (!ticket[0] || ticket[0].userId !== user.id) throw new HttpError(404, "Ticket not found.", "NOT_FOUND");
      await db.insert(supportMessages).values({ ticketId: body.ticketId, authorId: user.id, body: body.message.slice(0, 4000) });
      await db.update(supportTickets).set({ status: "open", updatedAt: new Date() }).where(eq(supportTickets.id, body.ticketId));
      return { ok: true };
    }
    if (body.intent === "read") {
      await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, user.id));
      return { ok: true };
    }
    const subject = (body.subject || "").trim();
    const message = (body.message || "").trim();
    if (subject.length < 3 || message.length < 3) throw new HttpError(400, "Subject and message are required.", "TICKET");
    const [ticket] = await db.insert(supportTickets).values({
      userId: user.id,
      subject: subject.slice(0, 140),
      category: body.category || "support",
      priority: ["low", "normal", "high"].includes(body.priority) ? body.priority : "normal",
    }).returning();
    await db.insert(supportMessages).values({ ticketId: ticket.id, authorId: user.id, body: message.slice(0, 4000) });
    return { ticket };
  });
}
