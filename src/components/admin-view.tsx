import Link from "next/link";
import { AppSide } from "@/components/chrome";
import { AdminForm, SignOut } from "@/components/interactive";
import { assertStaff, loadAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/http";
import { getLang } from "@/lib/lang";
import { can } from "@/lib/permissions";

const NAV = ["overview", "users", "designers", "team", "templates", "reviews", "websites", "subscriptions", "plans", "payments", "marketplace", "payouts", "reports", "support", "analytics", "coupons", "notifications", "audit", "settings", "maintenance"];

export async function AdminView({ section = "overview" }: { section?: string }) {
  const user = await requireUser();
  assertStaff(user);
  const lang = await getLang();
  const data = await loadAdmin(user, section);
  return (
    <div className="app-shell">
      <AppSide lang={lang} items={NAV.filter((item) => item === "overview" || can(user, permFor(item)) || user.role === "owner").map((item) => ({ href: item === "overview" ? "/admin" : `/admin/${item}`, label: item }))} active={section === "overview" ? "/admin" : `/admin/${section}`} extra={<SignOut />} />
      <div className="main">
        <div className="page-title"><h1 className="display">{section}</h1><Link href="/dashboard">Back to dashboard</Link></div>
        <Section section={section} data={data} />
      </div>
    </div>
  );
}

function permFor(section: string) {
  const map: Record<string, string> = {
    users: "users.manage", designers: "designers.manage", team: "team.manage", templates: "templates.review", reviews: "templates.review", websites: "websites.moderate", subscriptions: "subscriptions.manage", plans: "plans.manage", payments: "payments.manage", marketplace: "payments.manage", payouts: "payouts.manage", reports: "reports.manage", support: "support.manage", analytics: "analytics.read", coupons: "coupons.manage", notifications: "notifications.broadcast", audit: "audit.read", settings: "settings.manage", maintenance: "maintenance.manage",
  };
  return map[section] || "analytics.read";
}

function Section({ section, data }: { section: string; data: unknown }) {
  if (section === "overview") {
    const row = data as Record<string, number>;
    return <div className="grid-3">{Object.entries(row).map(([key, value]) => <article key={key} className="card"><h3>{key}</h3><p>{key === "revenue" ? money(value) : value}</p></article>)}</div>;
  }
  if (section === "users") {
    const rows = data as { id: string; name: string; email: string; role: string; status: string }[];
    return <div>{rows.map((row) => <article key={row.id} className="card"><b>{row.name}</b> · {row.email} · {row.role} · {row.status}<AdminForm action="user.role" label="Set role" fields={[{ name: "userId", value: row.id, label: "User" }, { name: "role", label: "Role", value: row.role }]} /><AdminForm action="user.status" label="Set status" fields={[{ name: "userId", value: row.id, label: "User" }, { name: "status", label: "Status", value: row.status }]} /></article>)}</div>;
  }
  if (section === "reviews" || section === "templates") {
    const payload = data as { templates: { template: { id: string; name: string; status: string; designerId: string }; designer: { name: string } }[] };
    return <div>{payload.templates.map((row) => <article key={row.template.id} className="card"><h3>{row.template.name}</h3><p>{row.template.status} · {row.designer.name}</p><AdminForm action="template.review" label="Review" fields={[{ name: "templateId", value: row.template.id, label: "Template" }, { name: "decision", label: "Decision", value: "UNDER_REVIEW" }, { name: "reason", label: "Reason" }]} /></article>)}<AdminForm action="category.save" label="Save category" fields={[{ name: "key", label: "Key" }, { name: "group", label: "Group" }, { name: "name", label: "Name" }]} /></div>;
  }
  if (section === "plans") {
    const rows = data as { key: string; name: string; priceMonthly: number; priceQuarterly: number; priceYearly: number; description: string }[];
    return <div>{rows.map((plan) => <AdminForm key={plan.key} action="plan.save" label={`Save ${plan.name}`} fields={[{ name: "key", value: plan.key, label: "Key" }, { name: "name", value: plan.name, label: "Name" }, { name: "description", value: plan.description, label: "Description" }, { name: "priceMonthly", value: String(plan.priceMonthly), label: "Monthly cents" }, { name: "priceQuarterly", value: String(plan.priceQuarterly), label: "Quarter cents" }, { name: "priceYearly", value: String(plan.priceYearly), label: "Year cents" }]} />)}</div>;
  }
  if (section === "coupons") return <div><AdminForm action="coupon.save" label="Save coupon" fields={[{ name: "code", label: "Code" }, { name: "percentOff", label: "Percent" }, { name: "amountOff", label: "Amount cents" }, { name: "maxUses", label: "Max uses" }]} /><pre>{JSON.stringify(data, null, 2)}</pre></div>;
  if (section === "payouts") {
    const rows = data as { payout: { id: string; amount: number; status: string }; user: { name: string } }[];
    return (
      <div>
        {rows.map((row) => (
          <article key={row.payout.id} className="card">
            <p>{row.user.name} · {money(row.payout.amount)} · {row.payout.status}</p>
            {row.payout.status === "requested" && (
              <AdminForm action="payout.review" label="Approve payout" fields={[
                { name: "id", value: row.payout.id, label: "Id" },
                { name: "decision", label: "Decision", value: "approved" },
                { name: "note", label: "Note" },
              ]} />
            )}
            {row.payout.status === "approved" && (
              <AdminForm action="payout.review" label="Mark as paid" fields={[
                { name: "id", value: row.payout.id, label: "Id" },
                { name: "decision", label: "Decision", value: "paid" },
                { name: "note", label: "Note" },
              ]} />
            )}
            {["requested", "approved"].includes(row.payout.status) && (
              <AdminForm action="payout.review" label="Reject payout" fields={[
                { name: "id", value: row.payout.id, label: "Id" },
                { name: "decision", label: "Decision", value: "rejected" },
                { name: "note", label: "Reason" },
              ]} />
            )}
          </article>
        ))}
      </div>
    );
  }
  if (section === "payments" || section === "marketplace") {
    const rows = data as { payment: { id: string; amount: number; currency: string; status: string; purpose: string; provider: string; createdAt: Date }; user: { email: string } }[];
    return (
      <div>
        {rows.map((row) => (
          <article key={row.payment.id} className="card">
            <p>{row.user.email} · {row.payment.purpose} · {money(row.payment.amount, row.payment.currency)} · {row.payment.status}</p>
            <small>{row.payment.provider} · {row.payment.id}</small>
            {row.payment.status === "pending" && row.payment.provider === "manual_contact" && (
              <div className="grid-2">
                <AdminForm action="payment.approve" label="Confirm received" fields={[{ name: "paymentId", value: row.payment.id, label: "Payment reference" }]} />
                <AdminForm action="payment.reject" label="Reject payment" fields={[{ name: "paymentId", value: row.payment.id, label: "Payment reference" }, { name: "reason", label: "Reason" }]} />
              </div>
            )}
            {row.payment.status === "succeeded" && (
              <AdminForm action="payment.refund" label="Refund" fields={[{ name: "paymentId", value: row.payment.id, label: "Payment" }, { name: "reason", label: "Reason" }]} />
            )}
          </article>
        ))}
      </div>
    );
  }
  if (section === "support") {
    const rows = data as { ticket: { id: string; subject: string; status: string }; user: { email: string } }[];
    return <div>{rows.map((row) => <article key={row.ticket.id} className="card"><h3>{row.ticket.subject}</h3><p>{row.user.email} · {row.ticket.status}</p><AdminForm action="ticket.reply" label="Reply" fields={[{ name: "ticketId", value: row.ticket.id, label: "Ticket" }, { name: "message", label: "Message" }, { name: "status", value: "pending", label: "Status" }]} /></article>)}</div>;
  }
  if (section === "notifications") return <AdminForm action="broadcast" label="Broadcast" fields={[{ name: "title", label: "Title" }, { name: "body", label: "Body" }]} />;
  if (section === "settings") {
    const rows = data as { key: string; value: unknown }[];
    const commission = rows.find((row) => row.key === "commissionRate");
    const contact = rows.find((row) => row.key === "paymentContact")?.value as { phone?: string; instructions?: string } | undefined;
    return <div className="grid-2"><AdminForm action="settings" label="Save commission rate" fields={[{ name: "key", value: "commissionRate", label: "Setting key" }, { name: "value", value: String(commission?.value ?? 20), label: "Commission percent" }]} /><AdminForm action="payment.contact" label="Save payment contact" fields={[{ name: "phone", value: contact?.phone || "", label: "WhatsApp number (international, e.g. +2010...)", type: "tel" }, { name: "instructions", value: contact?.instructions || "", label: "Payment instructions" }]} /></div>;
  }
  if (section === "maintenance") return <AdminForm action="maintenance" label="Set maintenance" fields={[{ name: "enabled", value: "false", label: "Enabled true/false" }, { name: "message", label: "Message" }]} />;
  if (section === "websites") {
    const rows = data as { site: { id: string; name: string; status: string; slug: string }; owner: { email: string } }[];
    return <div>{rows.map((row) => <article key={row.site.id} className="card"><p>{row.site.name} · {row.site.status} · {row.owner.email}</p><Link href={`/s/${row.site.slug}`}>Open</Link><AdminForm action="website.unpublish" label="Unpublish" fields={[{ name: "websiteId", value: row.site.id, label: "Site" }, { name: "reason", label: "Reason" }]} /></article>)}</div>;
  }
  return <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(data, null, 2)}</pre>;
}
