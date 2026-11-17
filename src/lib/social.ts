import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  designerFollowers,
  designerPosts,
  designerProfiles,
  designerRatings,
  postLikes,
  reports,
  users,
  websiteLikes,
  websiteSaves,
  websites,
} from "@/db/schema";
import { HttpError } from "./http";
import { audit, notify } from "./notify";
import type { SessionUser } from "./types";
import { cacheRemember } from "./redis";

export async function publicDesigners() {
  return cacheRemember("social:public-designers", 60, () => db
    .select({
      user: { id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl, headline: users.headline, bio: users.bio, createdAt: users.createdAt },
      profile: designerProfiles,
    })
    .from(designerProfiles)
    .innerJoin(users, eq(designerProfiles.userId, users.id))
    .where(eq(users.status, "active"))
    .orderBy(desc(designerProfiles.verified), desc(users.createdAt)));
}

export async function designerByUsername(username: string) {
  return cacheRemember(`social:designer:${username.toLowerCase()}`, 30, async () => {
    const rows = await db
      .select({ user: { id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl, bio: users.bio, headline: users.headline, role: users.role, status: users.status, createdAt: users.createdAt }, profile: designerProfiles })
      .from(users)
      .leftJoin(designerProfiles, eq(designerProfiles.userId, users.id))
      .where(eq(users.username, username.toLowerCase()))
      .limit(1);
    const row = rows[0];
    if (!row || row.user.status !== "active") return null;
    return row;
  });
}

export async function followState(viewerId: string | null, designerId: string) {
  const [followers, following, mineRows] = await Promise.all([
    db.select({ total: count() }).from(designerFollowers).where(eq(designerFollowers.designerId, designerId)),
    db.select({ total: count() }).from(designerFollowers).where(eq(designerFollowers.followerId, designerId)),
    viewerId ? db.select({ id: designerFollowers.followerId }).from(designerFollowers).where(and(eq(designerFollowers.followerId, viewerId), eq(designerFollowers.designerId, designerId))).limit(1) : Promise.resolve([]),
  ]);
  return { followers: Number(followers[0]?.total || 0), following: Number(following[0]?.total || 0), mine: mineRows.length > 0 };
}

export async function toggleFollow(user: SessionUser, designerId: string) {
  if (user.id === designerId) throw new HttpError(400, "You cannot follow yourself.", "FOLLOW");
  const existing = await db.select({ followerId: designerFollowers.followerId }).from(designerFollowers).where(and(eq(designerFollowers.followerId, user.id), eq(designerFollowers.designerId, designerId))).limit(1);
  if (existing[0]) {
    await db.delete(designerFollowers).where(and(eq(designerFollowers.followerId, user.id), eq(designerFollowers.designerId, designerId)));
    return { following: false };
  }
  await db.insert(designerFollowers).values({ followerId: user.id, designerId });
  await notify(designerId, "follow", "New follower", `${user.name} followed you.`, `/designers/${user.username}`);
  return { following: true };
}

export async function listPosts(designerId: string) {
  return cacheRemember(`social:posts:${designerId}`, 15, () => db.select({
    id: designerPosts.id,
    designerId: designerPosts.designerId,
    body: designerPosts.body,
    imageUrl: designerPosts.imageUrl,
    createdAt: designerPosts.createdAt,
    likes: sql<number>`count(${postLikes.userId})::int`,
  }).from(designerPosts)
    .leftJoin(postLikes, eq(postLikes.postId, designerPosts.id))
    .where(eq(designerPosts.designerId, designerId))
    .groupBy(designerPosts.id)
    .orderBy(desc(designerPosts.createdAt))
    .limit(20));
}

export async function createPost(user: SessionUser, body: string, imageUrl?: string) {
  const text = body.trim().slice(0, 800);
  if (text.length < 2) throw new HttpError(400, "Write something first.", "POST");
  const profile = await db.select().from(designerProfiles).where(eq(designerProfiles.userId, user.id)).limit(1);
  if (!profile[0] && user.role === "user" && !user.features.canCreateTemplates) throw new HttpError(403, "Posts belong to designer profiles.", "DESIGNER");
  const [post] = await db.insert(designerPosts).values({ designerId: user.id, body: text, imageUrl: imageUrl || null }).returning();
  return post;
}

export async function togglePostLike(user: SessionUser, postId: string) {
  const existing = await db.select({ userId: postLikes.userId }).from(postLikes).where(and(eq(postLikes.userId, user.id), eq(postLikes.postId, postId))).limit(1);
  if (existing[0]) {
    await db.delete(postLikes).where(and(eq(postLikes.userId, user.id), eq(postLikes.postId, postId)));
    return { liked: false };
  }
  await db.insert(postLikes).values({ userId: user.id, postId });
  return { liked: true };
}

export async function rateDesigner(user: SessionUser, designerId: string, score: number, comment: string) {
  if (user.id === designerId) throw new HttpError(400, "You cannot rate yourself.", "RATING");
  if (score < 1 || score > 5) throw new HttpError(400, "Score must be 1 to 5.", "RATING");
  await db
    .insert(designerRatings)
    .values({ raterId: user.id, designerId, score, comment: comment.slice(0, 300) })
    .onConflictDoUpdate({ target: [designerRatings.raterId, designerRatings.designerId], set: { score, comment: comment.slice(0, 300) } });
  return { ok: true };
}

export async function exploreSites(q?: string) {
  const queryKey = (q || "").trim().slice(0, 60).toLowerCase();
  return cacheRemember(`social:explore:${queryKey}`, 30, async () => {
  const filters = [eq(websites.status, "PUBLISHED"), eq(websites.showInExplore, true)];
  if (queryKey) filters.push(or(ilike(websites.name, `%${queryKey}%`), ilike(websites.category, `%${queryKey}%`))!);
  return db.select({
    site: { id: websites.id, name: websites.name, slug: websites.slug, category: websites.category, publishedAt: websites.publishedAt, seoTitle: websites.seoTitle, seoDescription: websites.seoDescription, ogImage: websites.ogImage },
    owner: { name: users.name, username: users.username, avatarUrl: users.avatarUrl },
  }).from(websites)
    .innerJoin(users, eq(websites.ownerId, users.id))
    .where(and(...filters))
    .orderBy(desc(websites.publishedAt))
    .limit(60);
  });
}

export async function toggleSiteLike(user: SessionUser, websiteId: string) {
  const site = await db.select({ id: websites.id }).from(websites).where(and(eq(websites.id, websiteId), eq(websites.status, "PUBLISHED"), eq(websites.showInExplore, true))).limit(1);
  if (!site[0]) throw new HttpError(404, "Site is not public.", "NOT_FOUND");
  const existing = await db.select({ userId: websiteLikes.userId }).from(websiteLikes).where(and(eq(websiteLikes.userId, user.id), eq(websiteLikes.websiteId, websiteId))).limit(1);
  if (existing[0]) {
    await db.delete(websiteLikes).where(and(eq(websiteLikes.userId, user.id), eq(websiteLikes.websiteId, websiteId)));
    return { liked: false };
  }
  await db.insert(websiteLikes).values({ userId: user.id, websiteId });
  return { liked: true };
}

export async function toggleSiteSave(user: SessionUser, websiteId: string) {
  const site = await db.select({ id: websites.id }).from(websites).where(and(eq(websites.id, websiteId), eq(websites.status, "PUBLISHED"), eq(websites.showInExplore, true))).limit(1);
  if (!site[0]) throw new HttpError(404, "Site is not public.", "NOT_FOUND");
  const existing = await db.select({ userId: websiteSaves.userId }).from(websiteSaves).where(and(eq(websiteSaves.userId, user.id), eq(websiteSaves.websiteId, websiteId))).limit(1);
  if (existing[0]) {
    await db.delete(websiteSaves).where(and(eq(websiteSaves.userId, user.id), eq(websiteSaves.websiteId, websiteId)));
    return { saved: false };
  }
  await db.insert(websiteSaves).values({ userId: user.id, websiteId });
  return { saved: true };
}

export async function fileReport(user: SessionUser, targetType: string, targetId: string, reason: string, details: string) {
  const allowed = new Set(["template", "website", "comment", "designer", "post"]);
  if (!allowed.has(targetType)) throw new HttpError(400, "Unknown report target.", "REPORT");
  if (reason.trim().length < 4) throw new HttpError(400, "Add a reason.", "REPORT");
  const [row] = await db
    .insert(reports)
    .values({ reporterId: user.id, targetType, targetId: targetId.slice(0, 80), reason: reason.slice(0, 80), details: details.slice(0, 600) })
    .returning();
  await audit(user.id, "report.create", targetType, targetId, { reason });
  return row;
}

export async function designerRatingSummary(designerId: string) {
  const [row] = await db.select({ avg: sql<number>`coalesce(avg(${designerRatings.score}), 0)::float`, total: count() })
    .from(designerRatings).where(eq(designerRatings.designerId, designerId));
  return { avg: Number(row?.avg || 0), count: Number(row?.total || 0) };
}
