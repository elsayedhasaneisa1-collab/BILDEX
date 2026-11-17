import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, subscriptionPlans } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { requireUser } from "@/lib/auth";
import { createPayment, quoteCheckout, requestPayout } from "@/lib/billing";
import { assertCsrf, handle, readJson } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const plans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
    const history = await db.select().from(payments).where(eq(payments.userId, user.id)).orderBy(desc(payments.createdAt)).limit(30);
    return { plans, history, planKey: user.planKey, features: user.features, periodEnd: user.periodEnd, status: user.subscriptionStatus };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const body = await readJson<{ intent?: string; planKey?: string; interval?: string; templateId?: string; couponCode?: string; paymentId?: string; amount?: number; note?: string }>(req);
    if (body.intent === "quote") return quoteCheckout({ purpose: body.templateId ? "template" : "subscription", planKey: body.planKey, interval: body.interval, templateId: body.templateId, couponCode: body.couponCode });
    if (body.intent === "payout") return requestPayout(user, Number(body.amount), body.note || "");
    const payment = await createPayment(user, {
      purpose: body.templateId ? "template" : "subscription",
      planKey: body.planKey,
      interval: body.interval,
      templateId: body.templateId,
      couponCode: body.couponCode,
    });
    return { paymentId: payment.id, status: payment.status, amount: payment.amount };
  });
}
