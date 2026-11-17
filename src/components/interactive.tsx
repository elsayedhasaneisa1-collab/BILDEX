"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function TemplateActions({ id, price }: { id: string; price: number }) {
  const router = useRouter();
  const [name, setName] = useState("My site");
  const [error, setError] = useState("");
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  return (
    <div>
      {error && <div className="form-error">{error}</div>}
      <label className="field"><span>Website name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button className="btn orange" type="button" onClick={async () => {
        try {
          if (price > 0) {
            const access = await api<{ purchased: boolean }>(`/api/templates/${id}`);
            if (!access.purchased) {
              const order = await api<{ paymentId: string; status: string }>("/api/billing", { templateId: id });
              if (order.status !== "succeeded") {
                router.push(`/checkout/${order.paymentId}`);
                return;
              }
            }
          }
          const created = await api<{ site: { id: string } }>("/api/websites", { name, templateId: id });
          router.push(`/studio/${created.site.id}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not start");
        }
      }}>{price > 0 ? "Buy and use" : "Use template"}</button>
      <button className="btn small line" type="button" onClick={() => api(`/api/templates/${id}`, { action: "favorite" }).then(() => router.refresh())}>Save</button>
      <div style={{ marginTop: 12 }}>
        <input type="number" min={1} max={5} value={score} onChange={(event) => setScore(Number(event.target.value))} />
        <button className="btn small" type="button" onClick={() => api(`/api/templates/${id}`, { action: "rate", score }).then(() => router.refresh())}>Rate</button>
      </div>
      <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comment" />
      <button className="btn small" type="button" onClick={() => api(`/api/templates/${id}`, { action: "comment", body: comment }).then(() => router.refresh())}>Comment</button>
    </div>
  );
}

export function DesignerActions({ designerId, following }: { designerId: string; following: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [score, setScore] = useState(5);
  return (
    <div>
      <button className="btn orange" type="button" onClick={() => api("/api/social", { action: "follow", designerId }).then(() => router.refresh())}>{following ? "Unfollow" : "Follow"}</button>
      <div style={{ marginTop: 12 }}>
        <input type="number" min={1} max={5} value={score} onChange={(event) => setScore(Number(event.target.value))} />
        <button className="btn small" type="button" onClick={() => api("/api/social", { action: "rate-designer", designerId, score, comment: "" }).then(() => router.refresh())}>Rate designer</button>
      </div>
      <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Post to your own profile" />
      <button className="btn small" type="button" onClick={() => api("/api/social", { action: "post", body }).then(() => { setBody(""); router.refresh(); })}>Publish post</button>
      <ReportButton targetType="designer" targetId={designerId} />
    </div>
  );
}

export function ReportButton({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  if (done) return <p>Report sent to staff.</p>;
  if (!open) return <button className="btn small line" type="button" onClick={() => setOpen(true)}>Report</button>;
  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      await api("/api/social", { action: "report", targetType, targetId, reason, details: reason });
      setDone(true);
    }}>
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" required />
      <button className="btn small" type="submit">Send report</button>
    </form>
  );
}

export function ExploreActions({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  return (
    <span>
      <button className="btn small" type="button" onClick={() => api("/api/social", { action: "like-site", websiteId }).then(() => router.refresh())}>Like</button>
      <button className="btn small line" type="button" onClick={() => api("/api/social", { action: "save-site", websiteId }).then(() => router.refresh())}>Save</button>
    </span>
  );
}

export function CheckoutForm({ paymentId, amount, currency, label, phone, instructions }: { paymentId: string; amount: number; currency: string; label: string; phone: string; instructions: string }) {
  const digits = phone.replace(/\D/g, "");
  const message = encodeURIComponent(`مرحباً، أريد تأكيد الدفع لطلب BUILDEX رقم ${paymentId}.\nالخدمة: ${label}\nالمبلغ: ${(amount / 100).toFixed(2)} ${currency}\nسأرسل صورة إثبات التحويل هنا.`);
  const whatsapp = digits ? `https://wa.me/${digits}?text=${message}` : "";
  return (
    <div className="card" style={{ maxWidth: 640, margin: "24px auto" }}>
      <h1 className="display">Complete your order</h1>
      <p>{label}</p>
      <p className="price">{new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100)}</p>
      <div className="notice">
        <strong>Manual payment confirmation</strong>
        <p>Contact the BUILDEX payment desk using the official number below. Send your order reference and transfer receipt. Your subscription or template will activate only after an administrator verifies the payment.</p>
        {instructions && <p>{instructions}</p>}
      </div>
      {phone ? (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <p><strong>Payment WhatsApp:</strong> {phone}</p>
          <a className="btn orange" href={whatsapp} target="_blank" rel="noreferrer">Contact payment desk on WhatsApp</a>
        </div>
      ) : (
        <div className="form-error">The administrator has not configured the payment contact number yet. Your order is saved as pending; please contact platform support.</div>
      )}
      <p style={{ marginTop: 16, fontSize: 13, opacity: .75 }}>Order reference: {paymentId}</p>
      <a className="btn line" href="/dashboard/subscription">Back to subscription</a>
    </div>
  );
}

export function WebsiteControls({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [rename, setRename] = useState(name);
  const [confirm, setConfirm] = useState("");
  async function run(action: string, extra: Record<string, unknown> = {}) {
    try {
      await api(`/api/websites/${id}/actions`, { action, ...extra });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }
  return (
    <div className="card">
      {error && <div className="form-error">{error}</div>}
      <p>Status {status}</p>
      <LinkRow href={`/studio/${id}`} label="Open studio" />
      <LinkRow href={`/preview/${id}`} label="Preview" />
      <button className="btn small" type="button" onClick={() => run("publish", { seoTitle: name })}>Publish</button>
      <button className="btn small line" type="button" onClick={() => run("unpublish")}>Unpublish</button>
      <button className="btn small line" type="button" onClick={() => run("duplicate")}>Duplicate</button>
      <input value={rename} onChange={(event) => setRename(event.target.value)} />
      <button className="btn small" type="button" onClick={() => run("rename", { name: rename })}>Rename</button>
      <input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type the site name to delete" />
      <button className="btn small line" type="button" onClick={() => run("delete", { confirm })}>Delete</button>
    </div>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return <a className="btn small" href={href}>{label}</a>;
}

export function CreateSiteForm({ templates }: { templates: { id: string; name: string; tier: string; price: number }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="card" onSubmit={async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        const created = await api<{ site: { id: string } }>("/api/websites", { name: data.name, templateId: data.templateId || null });
        router.push(`/studio/${created.site.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create");
      }
    }}>
      {error && <div className="form-error">{error}</div>}
      <label className="field"><span>Name</span><input name="name" required minLength={2} /></label>
      <label className="field"><span>Template</span>
        <select name="templateId" defaultValue="">
          <option value="">Blank canvas</option>
          {templates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.tier} · {item.price ? `$${(item.price / 100).toFixed(0)}` : "Free"}</option>)}
        </select>
      </label>
      <button className="btn orange" type="submit">Create and open Studio</button>
    </form>
  );
}

export function SettingsForm({ user }: { user: { name: string; username: string; bio: string; headline: string; email: string; avatarUrl: string | null } }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="grid-2">
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await api("/api/account", Object.fromEntries(new FormData(event.currentTarget).entries()), "PATCH");
          router.refresh();
        } catch (err) { setError(err instanceof Error ? err.message : "Update failed"); }
      }}>
        <h3>Profile</h3>
        {error && <div className="form-error">{error}</div>}
        <label className="field"><span>Name</span><input name="name" defaultValue={user.name} /></label>
        <label className="field"><span>Username</span><input name="username" defaultValue={user.username} /></label>
        <label className="field"><span>Headline</span><input name="headline" defaultValue={user.headline} /></label>
        <label className="field"><span>Profile image URL</span><input name="avatarUrl" type="text" defaultValue={user.avatarUrl || ""} placeholder="https://... or /images/..." /></label>
        <label className="field"><span>Bio</span><textarea name="bio" defaultValue={user.bio} /></label>
        <button className="btn" type="submit">Save profile</button>
      </form>
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        await api("/api/account", { intent: "password", ...data });
        router.refresh();
      }}>
        <h3>Password</h3>
        <label className="field"><span>Current</span><input name="current" type="password" required /></label>
        <label className="field"><span>New</span><input name="password" type="password" minLength={10} required /></label>
        <button className="btn" type="submit">Change password</button>
      </form>
    </div>
  );
}

export function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  return (
    <div className="card">
      <h3>Delete account</h3>
      <p>Scheduling deletion unpublishes sites now and anonymizes the account after 7 days. You can cancel until then. Immediate deletion removes sites now and keeps payment rows without your name.</p>
      <input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={email} />
      <button className="btn small" type="button" onClick={async () => {
        const data = await api<{ deletionScheduledAt?: string }>("/api/account", { intent: "schedule-delete", confirm });
        setMessage(`Scheduled for ${data.deletionScheduledAt}`);
      }}>Schedule deletion</button>
      <button className="btn small line" type="button" onClick={() => api("/api/account", { intent: "cancel-delete" }).then(() => setMessage("Deletion canceled"))}>Cancel deletion</button>
      <button className="btn small line" type="button" onClick={async () => { await api("/api/account", { intent: "delete-now", confirm }); router.push("/"); }}>Delete now</button>
      {message && <p>{message}</p>}
    </div>
  );
}

export function TicketForm() {
  const router = useRouter();
  return (
    <form className="card" onSubmit={async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      await api("/api/support", data);
      router.refresh();
    }}>
      <label className="field"><span>Subject</span><input name="subject" required /></label>
      <label className="field"><span>Priority</span><select name="priority"><option>low</option><option>normal</option><option>high</option></select></label>
      <label className="field"><span>Message</span><textarea name="message" required /></label>
      <button className="btn orange" type="submit">Open ticket</button>
    </form>
  );
}

export function TicketReply({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      const message = String(new FormData(event.currentTarget).get("message") || "");
      await api("/api/support", { intent: "reply", ticketId, message });
      router.refresh();
    }}>
      <textarea name="message" required />
      <button className="btn small" type="submit">Reply</button>
    </form>
  );
}

export function PlanCheckout({ plans }: { plans: { key: string; name: string; priceMonthly: number; priceQuarterly: number; priceYearly: number }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="card" onSubmit={async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        const order = await api<{ paymentId: string; status: string; amount: number }>("/api/billing", { planKey: data.planKey, interval: data.interval, couponCode: data.couponCode });
        if (order.status === "succeeded" || order.amount === 0) router.push("/dashboard/subscription");
        else router.push(`/checkout/${order.paymentId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start checkout");
      }
    }}>
      {error && <div className="form-error">{error}</div>}
      <label className="field"><span>Plan</span><select name="planKey">{plans.map((plan) => <option key={plan.key} value={plan.key}>{plan.name}</option>)}</select></label>
      <label className="field"><span>Interval</span><select name="interval"><option value="month">Monthly</option><option value="quarter">3 months</option><option value="year">Yearly</option></select></label>
      <label className="field"><span>Coupon</span><input name="couponCode" placeholder="WELCOME10" /></label>
      <button className="btn orange" type="submit">Continue to checkout</button>
    </form>
  );
}

export function AdminForm({ action, fields, label }: { action: string; fields: { name: string; label: string; value?: string; type?: string }[]; label: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="card" onSubmit={async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        await api("/api/admin", { action, ...data });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    }}>
      {error && <div className="form-error">{error}</div>}
      {fields.map((field) => <label key={field.name} className="field"><span>{field.label}</span><input name={field.name} defaultValue={field.value} type={field.type || "text"} /></label>)}
      <button className="btn small" type="submit">{label}</button>
    </form>
  );
}

export function PayoutRequest() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="card" onSubmit={async (event) => {
      event.preventDefault();
      const amount = Number(new FormData(event.currentTarget).get("amount"));
      try {
        await api("/api/billing", { intent: "payout", amount, note: String(new FormData(event.currentTarget).get("note") || "") });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payout failed");
      }
    }}>
      {error && <div className="form-error">{error}</div>}
      <label className="field"><span>Amount in cents</span><input name="amount" type="number" min={1000} required /></label>
      <label className="field"><span>Note</span><input name="note" /></label>
      <button className="btn" type="submit">Request payout</button>
    </form>
  );
}

export function SignOut() {
  const router = useRouter();
  return <button className="btn small ghost" type="button" onClick={async () => { await api("/api/auth/logout", {}); router.push("/"); router.refresh(); }}>Sign out</button>;
}
