import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { analyticsEvents, formSubmissions, notifications, payments, subscriptionPlans, supportMessages, supportTickets, templateFavorites, templates, websiteSaves, websites } from "@/db/schema";
import { AppSide } from "@/components/chrome";
import { CreateSiteForm, DeleteAccount, PlanCheckout, SettingsForm, SignOut, TicketForm, TicketReply, WebsiteControls } from "@/components/interactive";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/http";
import { getLang } from "@/lib/lang";
import { runDueJobs } from "@/lib/jobs";
import { listSubmissions } from "@/lib/websites";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/websites", label: "My websites" },
  { href: "/dashboard/new", label: "Create website" },
  { href: "/dashboard/templates", label: "My templates" },
  { href: "/dashboard/favorites", label: "Favorites" },
  { href: "/dashboard/subscription", label: "Subscription" },
  { href: "/dashboard/usage", label: "Usage statistics" },
  { href: "/dashboard/settings", label: "Account settings" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/support", label: "Support" },
];

export async function DashboardView({ section = "overview", id }: { section?: string; id?: string }) {
  await runDueJobs();
  const user = await requireUser();
  const lang = await getLang();
  const sites = await db.select({ id: websites.id, name: websites.name, slug: websites.slug, status: websites.status, updatedAt: websites.updatedAt })
    .from(websites).where(eq(websites.ownerId, user.id)).orderBy(desc(websites.updatedAt));
  return (
    <div className="app-shell">
      <AppSide lang={lang} items={NAV} active={section === "overview" ? "/dashboard" : `/dashboard/${section}`} extra={<div><SignOut />{user.features.canCreateTemplates || user.role === "designer" ? <p><Link href="/designer">Designer desk</Link></p> : null}{["admin", "owner", "reviewer", "support"].includes(user.role) ? <p><Link href="/admin">Command Center</Link></p> : null}<p><Link href="/id-card">Membership card</Link></p></div>} />
      <div className="main">
        {section === "overview" && <Overview userName={user.name} plan={user.planKey} sites={sites.length} published={sites.filter((site) => site.status === "PUBLISHED").length} />}
        {section === "websites" && <WebsiteList sites={sites} />}
        {section === "new" && <NewSite />}
        {section === "templates" && <UsedTemplates userId={user.id} />}
        {section === "favorites" && <Favorites userId={user.id} />}
        {section === "subscription" && <Subscription userId={user.id} userPlan={user.planKey} periodEnd={user.periodEnd} />}
        {section === "usage" && <Usage userId={user.id} sites={sites} />}
        {section === "settings" && <Settings user={user} />}
        {section === "notifications" && <Notes userId={user.id} />}
        {section === "support" && !id && <Support userId={user.id} />}
        {section === "support" && id && <Ticket id={id} userId={user.id} />}
        {section === "submissions" && id && <Submissions id={id} />}
      </div>
    </div>
  );
}

function Overview({ userName, plan, sites, published }: { userName: string; plan: string; sites: number; published: number }) {
  return (
    <>
      <div className="page-title"><h1 className="display">Hello, {userName}</h1><Link className="btn orange" href="/dashboard/new">Create website</Link></div>
      <div className="grid-3">
        <article className="card"><h3>Plan</h3><p>{plan}</p></article>
        <article className="card"><h3>Websites</h3><p>{sites}</p></article>
        <article className="card"><h3>Published</h3><p>{published}</p></article>
      </div>
    </>
  );
}

function WebsiteList({ sites }: { sites: { id: string; name: string; slug: string; status: string; updatedAt: Date }[] }) {
  if (!sites.length) return <div className="notice">No websites yet. <Link href="/dashboard/new">Create your first website</Link></div>;
  return (
    <div className="grid-2">
      {sites.map((site) => (
        <article key={site.id} className="card">
          <h3>{site.name}</h3>
          <p>{site.status} · /s/{site.slug}</p>
          <WebsiteControls id={site.id} name={site.name} status={site.status} />
          <p><Link href={`/dashboard/submissions/${site.id}`}>Form replies</Link></p>
        </article>
      ))}
    </div>
  );
}

async function NewSite() {
  const rows = await db.select({ id: templates.id, name: templates.name, tier: templates.tier, price: templates.price }).from(templates).where(eq(templates.status, "PUBLISHED"));
  return <div><h1 className="display">Create website</h1><CreateSiteForm templates={rows} /></div>;
}

async function UsedTemplates({ userId }: { userId: string }) {
  const rows = await db.select({ templateId: websites.templateId }).from(websites).where(eq(websites.ownerId, userId));
  const ids = [...new Set(rows.map((row) => row.templateId).filter(Boolean))] as string[];
  if (!ids.length) return <p>You have not started a site from a template yet.</p>;
  const items = await db.select({ id: templates.id, name: templates.name, slug: templates.slug }).from(templates).where(sql`${templates.id} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return <div className="grid-3">{items.map((item) => <Link key={item.id} className="card" href={`/templates/${item.slug}`}><h3>{item.name}</h3></Link>)}</div>;
}

async function Favorites({ userId }: { userId: string }) {
  const favs = await db.select({ templateId: templateFavorites.templateId }).from(templateFavorites).where(eq(templateFavorites.userId, userId));
  const saves = await db.select({ websiteId: websiteSaves.websiteId }).from(websiteSaves).where(eq(websiteSaves.userId, userId));
  return (
    <div>
      <h1 className="display">Favorites</h1>
      <p>{favs.length} templates · {saves.length} public sites</p>
      {favs.map((fav) => <p key={fav.templateId}><Link href="/templates">Saved template</Link></p>)}
    </div>
  );
}

async function Subscription({ userId, userPlan, periodEnd }: { userId: string; userPlan: string; periodEnd: string | null }) {
  const plans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
  const pending = await db.select().from(payments).where(and(eq(payments.userId, userId), eq(payments.status, "pending"))).orderBy(desc(payments.createdAt)).limit(10);
  return (
    <div>
      <h1 className="display">Subscription</h1>
      <p>Current plan: {userPlan}. {periodEnd ? `Period ends ${new Date(periodEnd).toLocaleDateString()}.` : ""} Ending a plan does not delete websites.</p>
      {pending.length > 0 && <section><h2>Pending payments</h2>{pending.map((payment) => <article key={payment.id} className="card"><p>{payment.purpose} · {money(payment.amount, payment.currency)} · pending</p><p>Reference: {payment.id}</p><Link className="btn small orange" href={`/checkout/${payment.id}`}>Continue payment</Link></article>)}</section>}
      <PlanCheckout plans={plans} />
    </div>
  );
}

async function Usage({ userId, sites }: { userId: string; sites: { id: string }[] }) {
  const visits = sites.length ? await db.select({ n: sql<number>`count(*)::int` }).from(analyticsEvents).where(sql`${analyticsEvents.websiteId} in (${sql.join(sites.map((site) => sql`${site.id}`), sql`, `)}) and ${analyticsEvents.eventType} = 'view'`) : [{ n: 0 }];
  const replies = sites.length ? await db.select({ n: sql<number>`count(*)::int` }).from(formSubmissions).where(sql`${formSubmissions.websiteId} in (${sql.join(sites.map((site) => sql`${site.id}`), sql`, `)})`) : [{ n: 0 }];
  void userId;
  return <div className="grid-3"><article className="card"><h3>Visits</h3><p>{visits[0]?.n || 0}</p></article><article className="card"><h3>Form replies</h3><p>{replies[0]?.n || 0}</p></article><article className="card"><h3>Sites</h3><p>{sites.length}</p></article></div>;
}

function Settings({ user }: { user: { name: string; username: string; bio: string; headline: string; email: string; avatarUrl: string | null } }) {
  return <div><h1 className="display">Account</h1><SettingsForm user={user} /><div style={{ height: 16 }} /><DeleteAccount email={user.email} /></div>;
}

async function Notes({ userId }: { userId: string }) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(40);
  if (!rows.length) return <p>No notifications yet.</p>;
  return <div>{rows.map((row) => <article key={row.id} className="card"><h3>{row.title}</h3><p>{row.body}</p>{row.href && <Link href={row.href}>Open</Link>}</article>)}</div>;
}

async function Support({ userId }: { userId: string }) {
  const rows = await db.select().from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.updatedAt)).limit(50);
  return <div><h1 className="display">Support</h1><TicketForm />{rows.map((ticket) => <p key={ticket.id}><Link href={`/dashboard/support/${ticket.id}`}>{ticket.subject}</Link> · {ticket.status} · {ticket.priority}</p>)}</div>;
}

async function Ticket({ id, userId }: { id: string; userId: string }) {
  const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  const ticket = rows[0];
  if (!ticket || ticket.userId !== userId) redirect("/dashboard/support");
  const messages = await db.select().from(supportMessages).where(eq(supportMessages.ticketId, id)).orderBy(desc(supportMessages.createdAt)).limit(100);
  messages.reverse();
  return <div><h1 className="display">{ticket.subject}</h1><p>{ticket.status}</p>{messages.map((message) => <article key={message.id} className="card"><p>{message.body}</p></article>)}<TicketReply ticketId={id} /></div>;
}

async function Submissions({ id }: { id: string }) {
  const user = await requireUser();
  const rows = await listSubmissions(user, id);
  return <div><h1 className="display">Replies</h1>{rows.map((row) => <article key={row.id} className="card"><pre>{JSON.stringify(row.payload, null, 2)}</pre></article>)}{!rows.length && <p>No replies yet.</p>}</div>;
}

void money;
