import { db } from "@/db";
import { auditLogs, notifications } from "@/db/schema";

export async function notify(userId: string, type: string, title: string, body: string, href?: string) {
  await db.insert(notifications).values({ userId, type, title, body, href: href || null });
}

export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
  ip?: string | null,
) {
  await db.insert(auditLogs).values({
    actorId,
    action,
    entityType,
    entityId,
    metadata,
    ip: ip || null,
  });
}
