import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { payments, systemSettings, templates } from "@/db/schema";
import { CheckoutForm } from "@/components/interactive";
import { requireUser } from "@/lib/auth";
import { ensureSeed } from "@/db/seed";

export const metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ paymentId: string }> }) {
  await ensureSeed();
  const user = await requireUser();
  const { paymentId } = await params;
  if (paymentId === "new") redirect("/dashboard/subscription");
  const rows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  const payment = rows[0];
  if (!payment || payment.userId !== user.id) notFound();
  if (payment.status === "succeeded") {
    if (payment.purpose === "template" && payment.templateId) {
      const template = await db.select({ slug: templates.slug }).from(templates).where(eq(templates.id, payment.templateId)).limit(1);
      if (template[0]) return <main className="section"><div className="card" style={{ maxWidth: 640, margin: "24px auto" }}><h1 className="display">Payment approved</h1><p>Your template purchase is active. You can now use the template.</p><a className="btn orange" href={`/templates/${template[0].slug}`}>Open purchased template</a></div></main>;
    }
    redirect("/dashboard/subscription");
  }
  if (payment.status !== "pending") return <main className="section"><div className="card" style={{ maxWidth: 640, margin: "24px auto" }}><h1 className="display">Payment is {payment.status}</h1><p>This order is no longer awaiting confirmation. If you need help, contact platform support and share this reference.</p><p>{payment.id}</p><a className="btn" href="/dashboard/subscription">Return to dashboard</a></div></main>;
  const label = String((payment.metadata as { label?: string })?.label || payment.purpose);
  const settings = await db.select().from(systemSettings).where(eq(systemSettings.key, "paymentContact")).limit(1);
  const contact = settings[0]?.value as { phone?: string; instructions?: string } | undefined;
  return <main className="section"><CheckoutForm paymentId={payment.id} amount={payment.amount} currency={payment.currency} label={label} phone={contact?.phone || ""} instructions={contact?.instructions || ""} /></main>;
}
