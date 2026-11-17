import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { designerIdCards, users } from "@/db/schema";

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const rows = await db.select({ card: designerIdCards, user: users }).from(designerIdCards).innerJoin(users, eq(users.id, designerIdCards.userId)).where(eq(designerIdCards.membershipId, code)).limit(1);
  const row = rows[0];
  if (!row || row.user.status === "deleted") notFound();
  return (
    <main className="section">
      <p className="kicker">BUILDEX verification</p>
      <h1 className="display">{row.user.name}</h1>
      <p>@{row.user.username}</p>
      <p>{row.card.roleLabel}</p>
      <p>{row.card.membershipId}</p>
      <p>Joined {row.user.createdAt.toLocaleDateString()}</p>
      <p>Status: {row.user.status === "active" ? "Active" : row.user.status}</p>
    </main>
  );
}
