import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { permissions, rolePermissions, roles, subscriptions, subscriptionPlans, userPermissions, userRoles, users } from "@/db/schema";
import { ROLE_DEFAULTS, freeFeatures } from "./constants";
import { HttpError } from "./http";
import type { PlanFeatures, PlanKey, SessionUser } from "./types";

export async function loadPermissions(userId: string, role: string) {
  const assigned = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  const roleKeys = assigned.length ? assigned.map((row) => row.key) : [role];
  const roleRows = await db.select().from(roles).where(inArray(roles.key, roleKeys));
  const roleIds = roleRows.map((row) => row.id);
  const granted = new Set<string>();
  if (role === "owner" || roleKeys.includes("owner")) granted.add("*");
  if (roleIds.length) {
    const rows = await db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));
    for (const row of rows) granted.add(row.key);
  }
  if (granted.size === 0) {
    for (const key of roleKeys) {
      for (const perm of ROLE_DEFAULTS[key] || []) granted.add(perm);
    }
  }
  const overrides = await db
    .select({ key: permissions.key, granted: userPermissions.granted })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.userId, userId));
  for (const override of overrides) {
    if (override.granted) granted.add(override.key);
    else granted.delete(override.key);
  }
  return [...granted];
}

export async function getPlanForUser(userId: string): Promise<{ planKey: PlanKey; features: PlanFeatures; status: string; periodEnd: string | null }> {
  const rows = await db
    .select({
      status: subscriptions.status,
      periodEnd: subscriptions.currentPeriodEnd,
      key: subscriptionPlans.key,
      features: subscriptionPlans.features,
      active: subscriptionPlans.active,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
  const current = rows.sort((a, b) => +new Date(b.periodEnd) - +new Date(a.periodEnd))[0];
  if (!current || !current.active || new Date(current.periodEnd).getTime() < Date.now()) {
    return { planKey: "free", features: freeFeatures(), status: current ? "expired" : "free", periodEnd: current?.periodEnd?.toISOString() ?? null };
  }
  const key = (["free", "plus", "pro", "designer"].includes(current.key) ? current.key : "free") as PlanKey;
  return {
    planKey: key,
    features: { ...freeFeatures(), ...current.features },
    status: current.status,
    periodEnd: current.periodEnd.toISOString(),
  };
}

export function can(user: Pick<SessionUser, "role" | "status" | "permissions">, permission: string) {
  if (user.status === "suspended" || user.status === "deleted") return false;
  if (user.role === "owner" || user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}

export function assertCan(user: Pick<SessionUser, "role" | "status" | "permissions">, permission: string) {
  if (!can(user, permission)) throw new HttpError(403, "You do not have permission to do that.", "FORBIDDEN");
}

export async function countOwners() {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "owner"));
  return rows.length;
}
