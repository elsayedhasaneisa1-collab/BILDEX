import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { designerIdCards, designerProfiles, users } from "@/db/schema";
import { IdCardView } from "@/components/id-card";
import { requireUser } from "@/lib/auth";
import { ensureSeed } from "@/db/seed";
import { appBase } from "@/lib/http";
import { ensureProfile } from "@/lib/admin";

export const metadata = { robots: { index: false, follow: false }, title: "Membership card" };

export default async function IdCardPage() {
  await ensureSeed();
  const user = await requireUser();
  const staff = ["designer", "reviewer", "support", "admin", "owner"].includes(user.role) || user.features.canCreateTemplates;
  if (!staff) {
    return <main className="section"><h1 className="display">Membership card</h1><p>Cards are issued to designers and staff. A subscription does not let you choose a rank.</p></main>;
  }
  if (user.role === "designer" || user.features.canCreateTemplates) await ensureProfile(user.id, false);
  const profile = (await db.select().from(designerProfiles).where(eq(designerProfiles.userId, user.id)).limit(1))[0];
  const membershipId = profile?.membershipId || `BDX-${new Date().getFullYear()}-${user.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const label = cardLabel(user.role, profile?.verified || false);
  const existing = await db.select().from(designerIdCards).where(eq(designerIdCards.userId, user.id)).limit(1);
  if (!existing[0]) {
    await db.insert(designerIdCards).values({ userId: user.id, membershipId, roleLabel: label, design: label.toLowerCase().replace(/\s+/g, "-"), status: user.status === "active" ? "active" : user.status }).onConflictDoNothing();
  } else if (existing[0].roleLabel !== label) {
    await db.update(designerIdCards).set({ roleLabel: label, design: label.toLowerCase().replace(/\s+/g, "-") }).where(eq(designerIdCards.userId, user.id));
  }
  const base = await appBase();
  const qr = await QRCode.toDataURL(`${base}/verify/${membershipId}`);
  const row = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return <IdCardView name={user.name} username={user.username} role={label} membershipId={membershipId} joined={row[0]?.createdAt.toISOString() || user.createdAt} status={user.status} qr={qr} avatar={user.avatarUrl} />;
}

function cardLabel(role: string, verified: boolean) {
  if (role === "owner" || role === "admin") return "BUILDEX Team";
  if (role === "reviewer") return "Reviewer";
  if (role === "support") return "Support";
  if (verified) return "Senior Designer";
  return "Designer";
}
