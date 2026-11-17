import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commissions,
  couponRedemptions,
  coupons,
  payments,
  payoutRequests,
  subscriptionPlans,
  subscriptions,
  templatePurchases,
  templates,
  systemSettings,
  transactions,
  users,
  webhookEvents,
} from "@/db/schema";
import { HttpError } from "./http";
import { audit, notify } from "./notify";
import type { SessionUser } from "./types";

function addInterval(date: Date, interval: string) {
  const next = new Date(date);
  if (interval === "year") next.setFullYear(next.getFullYear() + 1);
  else if (interval === "quarter") next.setMonth(next.getMonth() + 3);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

async function commissionRate() {
  const { systemSettings } = await import("@/db/schema");
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, "commissionRate")).limit(1);
  const value = Number(rows[0]?.value ?? 20);
  return Number.isFinite(value) ? Math.min(80, Math.max(0, value)) : 20;
}

export async function quoteCheckout(input: {
  purpose: "subscription" | "template";
  planKey?: string;
  interval?: string;
  templateId?: string;
  couponCode?: string;
}) {
  let amount = 0;
  let currency = "USD";
  let label = "";
  if (input.purpose === "subscription") {
    const planKey = input.planKey || "free";
    const interval = input.interval || "month";
    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.key, planKey)).limit(1);
    const plan = plans[0];
    if (!plan || !plan.active) throw new HttpError(404, "That plan is not available.", "PLAN");
    amount = interval === "year" ? plan.priceYearly : interval === "quarter" ? plan.priceQuarterly : plan.priceMonthly;
    currency = plan.currency;
    label = `${plan.name} · ${interval}`;
    if (input.couponCode && amount > 0) {
      const discount = await validateCoupon(input.couponCode, planKey);
      amount = applyDiscount(amount, discount.percentOff, discount.amountOff);
    }
    return { amount, currency, label, planKey, interval };
  }
  const rows = await db.select({ id: templates.id, price: templates.price, name: templates.name, status: templates.status }).from(templates).where(eq(templates.id, input.templateId || "")).limit(1);
  const template = rows[0];
  if (!template || template.status !== "PUBLISHED") throw new HttpError(404, "Template is not available.", "TEMPLATE");
  amount = template.price;
  label = template.name;
  return { amount, currency, label, templateId: template.id };
}

function applyDiscount(amount: number, percentOff: number, amountOff: number) {
  const percent = Math.round((amount * percentOff) / 100);
  return Math.max(0, amount - percent - amountOff);
}

export async function validateCoupon(code: string, planKey?: string) {
  const rows = await db.select().from(coupons).where(eq(coupons.code, code.trim().toUpperCase())).limit(1);
  const coupon = rows[0];
  if (!coupon || !coupon.active) throw new HttpError(400, "Coupon is not active.", "COUPON");
  if (coupon.startsAt && coupon.startsAt > new Date()) throw new HttpError(400, "Coupon is not active yet.", "COUPON");
  if (coupon.endsAt && coupon.endsAt < new Date()) throw new HttpError(400, "Coupon has expired.", "COUPON");
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new HttpError(400, "Coupon has reached its limit.", "COUPON");
  if (coupon.planKey && planKey && coupon.planKey !== planKey) throw new HttpError(400, "Coupon does not apply to this plan.", "COUPON");
  return coupon;
}

export async function createPayment(
  user: SessionUser,
  input: { purpose: "subscription" | "template"; planKey?: string; interval?: string; templateId?: string; couponCode?: string },
) {
  const quote = await quoteCheckout(input);
  if (quote.amount > 0) {
    const contactRows = await db.select().from(systemSettings).where(eq(systemSettings.key, "paymentContact")).limit(1);
    const contact = contactRows[0]?.value as { phone?: string } | undefined;
    if (!contact?.phone || contact.phone.replace(/\D/g, "").length < 8) {
      throw new HttpError(503, "The administrator has not configured the payment contact number yet.", "PAYMENT_CONTACT");
    }
  }
  let couponId: string | null = null;
  if (input.couponCode && input.purpose === "subscription") {
    const coupon = await validateCoupon(input.couponCode, input.planKey);
    couponId = coupon.id;
  }
  const pendingFilters = [eq(payments.userId, user.id), eq(payments.purpose, input.purpose), eq(payments.status, "pending")];
  if (input.purpose === "template") pendingFilters.push(eq(payments.templateId, input.templateId || ""));
  else {
    pendingFilters.push(eq(payments.planKey, input.planKey || "free"), eq(payments.interval, input.interval || "month"));
    pendingFilters.push(couponId ? eq(payments.couponId, couponId) : isNull(payments.couponId));
  }
  const existingPending = await db.select().from(payments).where(and(...pendingFilters)).orderBy(desc(payments.createdAt)).limit(1);
  if (existingPending[0]) return existingPending[0];
  const [payment] = await db
    .insert(payments)
    .values({
      userId: user.id,
      amount: quote.amount,
      currency: quote.currency,
      status: "pending",
      provider: quote.amount === 0 ? "free" : "manual_contact",
      purpose: input.purpose,
      planKey: input.planKey || null,
      interval: input.interval || null,
      templateId: input.templateId || null,
      couponId,
      metadata: { label: quote.label },
    })
    .returning();
  if (quote.amount === 0) {
    await applySignedEvent({
      eventId: `free_${payment.id}`,
      paymentId: payment.id,
      status: "succeeded",
      amount: 0,
      provider: "free",
    });
  }
  return payment;
}

export async function approveManualPayment(actor: SessionUser, paymentId: string) {
  const rows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  const payment = rows[0];
  if (!payment || payment.provider !== "manual_contact" || payment.status !== "pending") {
    throw new HttpError(400, "This manual payment is not awaiting approval.", "PAYMENT_STATE");
  }
  const applied = await applySignedEvent({
    eventId: `manual-approved-${payment.id}`,
    paymentId: payment.id,
    status: "succeeded",
    amount: payment.amount,
    provider: "manual_admin",
  });
  if (!applied) throw new HttpError(409, "The payment changed while it was being reviewed. Refresh the payments list.", "PAYMENT_STATE");
  await audit(actor.id, "payment.approve", "payment", payment.id, { amount: payment.amount, userId: payment.userId });
  return { ok: true };
}

export async function rejectManualPayment(actor: SessionUser, paymentId: string, reason: string) {
  const payment = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from payments where id = ${paymentId} for update`);
    const rows = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    const current = rows[0];
    if (!current || current.provider !== "manual_contact" || current.status !== "pending") {
      throw new HttpError(400, "This manual payment is not awaiting review.", "PAYMENT_STATE");
    }
    await tx.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, current.id));
    await tx.insert(transactions).values({
      paymentId: current.id,
      type: "manual_rejected",
      amount: current.amount,
      status: "failed",
      signatureVerified: true,
      raw: { reason: reason.slice(0, 400), actorId: actor.id },
    });
    return current;
  });
  await notify(payment.userId, "payment", "Payment needs attention", reason.trim().slice(0, 300) || "Your payment could not be approved. Contact support.", "/dashboard/subscription");
  await audit(actor.id, "payment.reject", "payment", payment.id, { reason, amount: payment.amount });
  return { ok: true };
}


async function applySignedEvent(event: { eventId: string; paymentId: string; status: string; amount: number; provider: string }) {
  if (!["succeeded", "failed"].includes(event.status)) throw new HttpError(400, "Unsupported payment event status.", "PAYMENT_EVENT");
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from payments where id = ${event.paymentId} for update`);
    const rows = await tx.select().from(payments).where(eq(payments.id, event.paymentId)).limit(1);
    const payment = rows[0];
    if (!payment) throw new HttpError(404, "Payment not found.", "PAYMENT");
    if (payment.amount !== event.amount) throw new HttpError(400, "Amount does not match the order.", "AMOUNT");
    const existing = await tx.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.eventId, event.eventId)).limit(1);
    if (existing[0] || payment.status !== "pending") return { applied: false, payment, subscription: false, sale: null as null | { designerId: string; templateName: string } };
    await tx.insert(webhookEvents).values({ eventId: event.eventId, provider: event.provider, payload: event });
    await tx.insert(transactions).values({
      paymentId: payment.id,
      type: event.status,
      amount: event.amount,
      status: event.status,
      signatureVerified: true,
      raw: event,
    });
    if (event.status === "failed") {
      await tx.update(payments).set({ status: "failed", updatedAt: new Date() }).where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
      return { applied: true, payment, subscription: false, sale: null };
    }
    await tx.update(payments).set({ status: "succeeded", providerRef: event.eventId, updatedAt: new Date() }).where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
    let activatedSubscription = false;
    let sale: null | { designerId: string; templateName: string } = null;
    if (payment.purpose === "subscription" && payment.planKey) {
      const plans = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.key, payment.planKey)).limit(1);
      const plan = plans[0];
      if (!plan) throw new HttpError(400, "Plan missing.", "PLAN");
      await tx.update(subscriptions).set({ status: "canceled" }).where(and(eq(subscriptions.userId, payment.userId), eq(subscriptions.status, "active")));
      const start = new Date();
      await tx.insert(subscriptions).values({
        userId: payment.userId,
        planId: plan.id,
        status: "active",
        interval: payment.interval || "month",
        currentPeriodStart: start,
        currentPeriodEnd: addInterval(start, payment.interval || "month"),
        provider: payment.provider,
        externalId: event.eventId,
      });
      activatedSubscription = true;
      if (payment.couponId) {
        await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, payment.couponId));
        await tx.insert(couponRedemptions).values({ couponId: payment.couponId, userId: payment.userId, paymentId: payment.id });
      }
    }
    if (payment.purpose === "template" && payment.templateId) {
      const templateRows = await tx.select({ id: templates.id, designerId: templates.designerId, name: templates.name }).from(templates).where(eq(templates.id, payment.templateId)).limit(1);
      const template = templateRows[0];
      if (!template) throw new HttpError(400, "Template missing.", "TEMPLATE");
      const rate = await commissionRate();
      const commission = Math.round((payment.amount * rate) / 100);
      const earning = payment.amount - commission;
      const [purchase] = await tx.insert(templatePurchases).values({
        templateId: template.id,
        buyerId: payment.userId,
        paymentId: payment.id,
        price: payment.amount,
        commission,
        designerEarning: earning,
      }).onConflictDoNothing().returning();
      if (purchase) {
        await tx.insert(commissions).values({ purchaseId: purchase.id, designerId: template.designerId, amount: earning, rate, status: "available" });
        await tx.update(templates).set({ usesCount: sql`${templates.usesCount} + 1` }).where(eq(templates.id, template.id));
        sale = { designerId: template.designerId, templateName: template.name };
      }
    }
    return { applied: true, payment, subscription: activatedSubscription, sale };
  });
  if (!outcome.applied) return;
  if (outcome.subscription) await notify(outcome.payment.userId, "subscription", "Subscription active", "Your plan is active. Existing sites were kept.", "/dashboard/subscription");
  if (outcome.sale) await notify(outcome.sale.designerId, "sale", "Template sold", `${outcome.sale.templateName} was purchased.`, "/designer/sales");
  return outcome.applied;
}

export async function refundPayment(actor: SessionUser, paymentId: string, reason: string) {
  const payment = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from payments where id = ${paymentId} for update`);
    const rows = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    const current = rows[0];
    if (!current || current.status !== "succeeded") throw new HttpError(400, "Only a succeeded payment can be refunded.", "REFUND");
    await tx.update(payments).set({ status: "refunded", updatedAt: new Date() }).where(eq(payments.id, current.id));
    await tx.insert(transactions).values({
      paymentId: current.id,
      type: "refund",
      amount: current.amount,
      status: "refunded",
      signatureVerified: true,
      raw: { reason, actorId: actor.id },
    });
    if (current.purpose === "subscription") {
      await tx.update(subscriptions).set({ status: "canceled" }).where(and(eq(subscriptions.userId, current.userId), eq(subscriptions.status, "active")));
    }
    if (current.purpose === "template") {
      const purchases = await tx.select().from(templatePurchases).where(eq(templatePurchases.paymentId, current.id));
      for (const purchase of purchases) {
        await tx.update(commissions).set({ status: "reversed" }).where(eq(commissions.purchaseId, purchase.id));
        await tx.delete(templatePurchases).where(eq(templatePurchases.id, purchase.id));
        await tx.update(templates).set({ usesCount: sql`greatest(0, ${templates.usesCount} - 1)` }).where(eq(templates.id, purchase.templateId));
      }
    }
    return current;
  });
  await notify(payment.userId, "payment", "Payment refunded", reason.trim().slice(0, 300) || "Your payment was refunded by the platform.", "/dashboard/subscription");
  await audit(actor.id, "payment.refund", "payment", payment.id, { reason, amount: payment.amount });
  return { ok: true };
}

export async function requestPayout(user: SessionUser, amount: number, note: string) {
  if (!Number.isInteger(amount) || amount < 1000) throw new HttpError(400, "Minimum payout is $10.00.", "PAYOUT");
  const [row] = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${user.id} for update`);
    const earnedRows = await tx.select({ amount: commissions.amount }).from(commissions).where(and(eq(commissions.designerId, user.id), eq(commissions.status, "available")));
    const paidRows = await tx.select({ amount: payoutRequests.amount }).from(payoutRequests).where(and(eq(payoutRequests.designerId, user.id), eq(payoutRequests.status, "paid")));
    const reservedRows = await tx.select({ amount: payoutRequests.amount }).from(payoutRequests).where(and(eq(payoutRequests.designerId, user.id), sql`${payoutRequests.status} in ('requested', 'approved')`));
    const earned = earnedRows.reduce((sum, item) => sum + item.amount, 0);
    const paid = paidRows.reduce((sum, item) => sum + item.amount, 0);
    const reserved = reservedRows.reduce((sum, item) => sum + item.amount, 0);
    if (amount > Math.max(0, earned - paid - reserved)) throw new HttpError(400, "Amount exceeds available earnings.", "PAYOUT");
    return tx.insert(payoutRequests).values({ designerId: user.id, amount, note: note.slice(0, 400) }).returning();
  });
  await audit(user.id, "payout.request", "payout", row.id, { amount });
  return row;
}

export async function availableBalance(designerId: string) {
  const rows = await db.select({ amount: commissions.amount, status: commissions.status }).from(commissions).where(eq(commissions.designerId, designerId));
  const earned = rows.filter((row) => row.status === "available").reduce((sum, row) => sum + row.amount, 0);
  const paid = await db.select().from(payoutRequests).where(and(eq(payoutRequests.designerId, designerId), eq(payoutRequests.status, "paid")));
  const paidSum = paid.reduce((sum, row) => sum + row.amount, 0);
  const reserved = await pendingPayouts(designerId);
  return Math.max(0, earned - paidSum - reserved);
}

export async function pendingPayouts(designerId: string) {
  const rows = await db.select().from(payoutRequests).where(and(eq(payoutRequests.designerId, designerId), sql`${payoutRequests.status} in ('requested', 'approved')`));
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

export async function reviewPayout(actor: SessionUser, id: string, decision: "approved" | "rejected" | "paid", note: string) {
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from payout_requests where id = ${id} for update`);
    const rows = await tx.select().from(payoutRequests).where(eq(payoutRequests.id, id)).limit(1);
    const current = rows[0];
    if (!current) throw new HttpError(404, "Payout not found.", "PAYOUT");
    if (decision === "approved" && current.status !== "requested") throw new HttpError(400, "Only requested payouts can be approved.", "PAYOUT");
    if (decision === "rejected" && !["requested", "approved"].includes(current.status)) throw new HttpError(400, "This payout can no longer be rejected.", "PAYOUT");
    if (decision === "paid" && current.status !== "approved") throw new HttpError(400, "Only approved payouts can be marked paid.", "PAYOUT");
    await tx.update(payoutRequests).set({ status: decision, note, reviewedBy: actor.id, reviewedAt: new Date() }).where(eq(payoutRequests.id, id));
    return current;
  });
  const designer = await db.select().from(users).where(eq(users.id, row.designerId)).limit(1);
  if (designer[0]) await notify(designer[0].id, "payout", `Payout ${decision}`, note || `Your payout request was ${decision}.`, "/designer/payouts");
  await audit(actor.id, `payout.${decision}`, "payout", id, { amount: row.amount, note });
}
