import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { payoutRequests, templatePurchases, templates } from "@/db/schema";
import { AppSide } from "@/components/chrome";
import { PayoutRequest, SignOut } from "@/components/interactive";
import { requireUser } from "@/lib/auth";
import { availableBalance } from "@/lib/billing";
import { money } from "@/lib/http";
import { getLang } from "@/lib/lang";
import { canCreateTemplates, designerTemplates } from "@/lib/templates";
import { DesignerCreate, DesignerProfileForm } from "@/components/designer-create";
import { ensureProfile } from "@/lib/admin";

const NAV = [
  { href: "/designer", label: "Overview" },
  { href: "/designer/templates", label: "My templates" },
  { href: "/designer/new", label: "Create template" },
  { href: "/designer/sales", label: "Sales" },
  { href: "/designer/earnings", label: "Earnings" },
  { href: "/designer/payouts", label: "Payouts" },
  { href: "/designer/analytics", label: "Analytics" },
  { href: "/designer/profile", label: "Public profile" },
];

export async function DesignerView({ section = "overview" }: { section?: string }) {
  const user = await requireUser();
  if (!(await canCreateTemplates(user))) redirect("/pricing");
  const lang = await getLang();
  const mine = await designerTemplates(user.id);
  const balance = await availableBalance(user.id);
  const profile = await ensureProfile(user.id);
  const account = { bio: user.bio, headline: user.headline };
  return (
    <div className="app-shell">
      <AppSide lang={lang} items={NAV} active={section === "overview" ? "/designer" : `/designer/${section}`} extra={<SignOut />} />
      <div className="main">
        {section === "overview" && <div><h1 className="display">Designer desk</h1><p>Available {money(balance)}. Templates {mine.length}. A subscription does not grant review rights.</p></div>}
        {section === "templates" && <div className="grid-2">{mine.map((item) => <article key={item.id} className="card"><h3>{item.name}</h3><p>{item.status}{item.hasPendingChanges ? " · changes waiting" : ""}</p><Link className="btn small" href={`/studio/template/${item.id}`}>Edit</Link></article>)}{!mine.length && <p>No templates yet.</p>}</div>}
        {section === "new" && <DesignerCreate />}
        {section === "sales" && <Sales designerId={user.id} />}
        {section === "earnings" && <p>Available balance {money(balance)}. Commission rate is set by staff, default 20%.</p>}
        {section === "payouts" && <Payouts designerId={user.id} balance={balance} />}
        {section === "analytics" && <p>Published templates: {mine.filter((item) => item.status === "PUBLISHED").length}. Uses: {mine.reduce((sum, item) => sum + item.usesCount, 0)}.</p>}
        {section === "profile" && <DesignerProfileForm user={account} profile={{ coverUrl: profile.coverUrl, skills: profile.skills, specialties: profile.specialties, socialLinks: profile.socialLinks, visibility: profile.visibility }} />}
      </div>
    </div>
  );
}

async function Sales({ designerId }: { designerId: string }) {
  const mine = await db.select({ id: templates.id }).from(templates).where(eq(templates.designerId, designerId));
  if (!mine.length) return <p>No sales yet.</p>;
  const rows = await db.select().from(templatePurchases)
    .where(sql`${templatePurchases.templateId} in (${sql.join(mine.map((item) => sql`${item.id}`), sql`, `)})`)
    .orderBy(desc(templatePurchases.createdAt)).limit(40);
  const sales = rows;
  return <div>{sales.map((sale) => <article key={sale.id} className="card"><p>{money(sale.price)} · earning {money(sale.designerEarning)}</p></article>)}{!sales.length && <p>No sales yet.</p>}</div>;
}

async function Payouts({ designerId, balance }: { designerId: string; balance: number }) {
  const rows = await db.select().from(payoutRequests).where(eq(payoutRequests.designerId, designerId)).orderBy(desc(payoutRequests.createdAt));
  return (
    <div>
      <p>Available {money(balance)}. Minimum request is $10.</p>
      <PayoutButton />
      {rows.map((row) => <article key={row.id} className="card"><p>{money(row.amount)} · {row.status}</p></article>)}
    </div>
  );
}

function PayoutButton() {
  return <PayoutRequest />;
}
