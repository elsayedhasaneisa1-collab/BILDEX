import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PlanFeatures, WebsiteDocument } from "@/lib/types";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio").notNull().default(""),
    headline: text("headline").notNull().default(""),
    role: text("role").notNull().default("user"),
    status: text("status").notNull().default("active"),
    locale: text("locale").notNull().default("ar"),
    deletionScheduledAt: ts("deletion_scheduled_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("users_role_idx").on(t.role), index("users_status_idx").on(t.status)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    deviceLabel: text("device_label"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("password_resets_user_idx").on(t.userId, t.createdAt)]);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt), index("login_attempts_ip_idx").on(t.ip, t.createdAt)],
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    granted: boolean("granted").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.permissionId] })],
);

export const designerProfiles = pgTable("designer_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  coverUrl: text("cover_url"),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  specialties: jsonb("specialties").$type<string[]>().notNull().default([]),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().notNull().default({}),
  visibility: jsonb("visibility").$type<Record<string, boolean>>().notNull().default({ bio: true, skills: true, socialLinks: true, posts: true, portfolio: true }),
  membershipId: text("membership_id").notNull().unique(),
  verified: boolean("verified").notNull().default(false),
  official: boolean("official").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const designerFollowers = pgTable(
  "designer_followers",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    designerId: uuid("designer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.designerId] }), index("designer_followers_target_idx").on(t.designerId, t.createdAt)],
);

export const designerPosts = pgTable(
  "designer_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    designerId: uuid("designer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    imageUrl: text("image_url"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("designer_posts_idx").on(t.designerId, t.createdAt)],
);

export const postLikes = pgTable(
  "post_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => designerPosts.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index("post_likes_post_idx").on(t.postId)],
);

export const designerRatings = pgTable(
  "designer_ratings",
  {
    raterId: uuid("rater_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    designerId: uuid("designer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.raterId, t.designerId] }), index("designer_ratings_target_idx").on(t.designerId)],
);

export const designerIdCards = pgTable("designer_id_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  membershipId: text("membership_id").notNull().unique(),
  roleLabel: text("role_label").notNull(),
  design: text("design").notNull(),
  status: text("status").notNull().default("active"),
  issuedAt: ts("issued_at").notNull().defaultNow(),
});

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceMonthly: integer("price_monthly").notNull().default(0),
  priceQuarterly: integer("price_quarterly").notNull().default(0),
  priceYearly: integer("price_yearly").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  active: boolean("active").notNull().default(true),
  features: jsonb("features").$type<PlanFeatures>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    status: text("status").notNull().default("active"),
    interval: text("interval").notNull().default("month"),
    currentPeriodStart: ts("current_period_start").notNull().defaultNow(),
    currentPeriodEnd: ts("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    provider: text("provider").notNull().default("manual_contact"),
    externalId: text("external_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId, t.status)],
);

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  percentOff: integer("percent_off").notNull().default(0),
  amountOff: integer("amount_off").notNull().default(0),
  planKey: text("plan_key"),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"),
    provider: text("provider").notNull().default("manual_contact"),
    providerRef: text("provider_ref"),
    purpose: text("purpose").notNull(),
    planKey: text("plan_key"),
    interval: text("interval"),
    templateId: uuid("template_id"),
    couponId: uuid("coupon_id").references(() => coupons.id),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("payments_user_idx").on(t.userId, t.createdAt)],
);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull(),
  signatureVerified: boolean("signature_verified").notNull().default(false),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  couponId: uuid("coupon_id")
    .notNull()
    .references(() => coupons.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull().unique(),
  provider: text("provider").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const websites = pgTable(
  "websites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("DRAFT"),
    document: jsonb("document").$type<WebsiteDocument>().notNull(),
    publishedDocument: jsonb("published_document").$type<WebsiteDocument>(),
    draftHash: text("draft_hash"),
    publishedHash: text("published_hash"),
    templateId: uuid("template_id"),
    templateVersion: text("template_version"),
    passwordHash: text("password_hash"),
    customDomain: text("custom_domain"),
    domainStatus: text("domain_status").notNull().default("none"),
    domainToken: text("domain_token"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    ogImage: text("og_image"),
    category: text("category").notNull().default("personal"),
    showInExplore: boolean("show_in_explore").notNull().default(false),
    removeBranding: boolean("remove_branding").notNull().default(false),
    publishedAt: ts("published_at"),
    scheduledAt: ts("scheduled_at"),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("websites_owner_idx").on(t.ownerId),
    index("websites_status_idx").on(t.status),
    index("websites_explore_idx").on(t.showInExplore, t.status),
  ],
);

export const websitePages = pgTable(
  "website_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    pageKey: text("page_key").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sort: integer("sort").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("website_pages_site_idx").on(t.websiteId)],
);

export const websiteVersions = pgTable(
  "website_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    document: jsonb("document").$type<WebsiteDocument>().notNull(),
    label: text("label").notNull().default("Checkpoint"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("website_versions_site_idx").on(t.websiteId, t.createdAt)],
);

export const websiteSettings = pgTable("website_settings", {
  websiteId: uuid("website_id")
    .primaryKey()
    .references(() => websites.id, { onDelete: "cascade" }),
  seo: jsonb("seo").$type<Record<string, unknown>>().notNull().default({}),
  access: jsonb("access").$type<Record<string, unknown>>().notNull().default({}),
  domain: jsonb("domain").$type<Record<string, unknown>>().notNull().default({}),
  publishing: jsonb("publishing").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const templateCategories = pgTable("template_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  group: text("group").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    designerId: uuid("designer_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull().default(""),
    categoryId: uuid("category_id").references(() => templateCategories.id),
    price: integer("price").notNull().default(0),
    tier: text("tier").notNull().default("free"),
    version: text("version").notNull().default("1.0.0"),
    status: text("status").notNull().default("DRAFT"),
    license: text("license").notNull().default("use"),
    previewImage: text("preview_image"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    document: jsonb("document").$type<WebsiteDocument>().notNull(),
    pendingDocument: jsonb("pending_document").$type<WebsiteDocument>(),
    ratingAvg: integer("rating_avg").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    usesCount: integer("uses_count").notNull().default(0),
    publishedAt: ts("published_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("templates_status_idx").on(t.status),
    index("templates_designer_idx").on(t.designerId),
    index("templates_category_idx").on(t.categoryId),
  ],
);

export const templateVersions = pgTable("template_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  document: jsonb("document").$type<WebsiteDocument>().notNull(),
  status: text("status").notNull().default("DRAFT"),
  changelog: text("changelog").notNull().default(""),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("template_versions_template_created_idx").on(t.templateId, t.createdAt)]);

export const templateReviews = pgTable(
  "template_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => templateVersions.id),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id),
    decision: text("decision").notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("template_reviews_template_idx").on(t.templateId)],
);

export const templateAssets = pgTable("template_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  mime: text("mime").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  safetyStatus: text("safety_status").notNull().default("quarantined"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const templatePurchases = pgTable(
  "template_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    price: integer("price").notNull(),
    commission: integer("commission").notNull().default(0),
    designerEarning: integer("designer_earning").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("template_purchases_unique").on(t.templateId, t.buyerId),
    index("template_purchases_designer_idx").on(t.buyerId),
    index("template_purchases_template_created_idx").on(t.templateId, t.createdAt),
  ],
);

export const templateRatings = pgTable(
  "template_ratings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.templateId] })],
);

export const templateComments = pgTable(
  "template_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("template_comments_idx").on(t.templateId, t.createdAt)],
);

export const templateFavorites = pgTable(
  "template_favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.templateId] })],
);

export const commissions = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => templatePurchases.id, { onDelete: "cascade" }),
    designerId: uuid("designer_id")
      .notNull()
      .references(() => users.id),
    amount: integer("amount").notNull(),
    rate: integer("rate").notNull(),
    status: text("status").notNull().default("available"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("commissions_designer_idx").on(t.designerId, t.status)],
);

export const payoutRequests = pgTable(
  "payout_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    designerId: uuid("designer_id")
      .notNull()
      .references(() => users.id),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("requested"),
    note: text("note").notNull().default(""),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("payouts_designer_idx").on(t.designerId, t.status)],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    provider: text("provider").notNull().default("local"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("media_owner_idx").on(t.ownerId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), index("notifications_read_created_idx").on(t.readAt, t.createdAt)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("support"),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tickets_status_idx").on(t.status, t.updatedAt)],
);

export const supportMessages = pgTable("support_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("support_messages_ticket_created_idx").on(t.ticketId, t.createdAt)]);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    pageSlug: text("page_slug").notNull().default("home"),
    visitorHash: text("visitor_hash").notNull(),
    source: text("source").notNull().default("direct"),
    device: text("device").notNull().default("desktop"),
    eventType: text("event_type").notNull().default("view"),
    eventKey: text("event_key"),
    durationMs: integer("duration_ms"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("analytics_site_idx").on(t.websiteId, t.createdAt), uniqueIndex("analytics_event_key_uidx").on(t.eventKey)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: ts("reset_at").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("rate_limit_reset_idx").on(t.resetAt)]);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    pageSlug: text("page_slug").notNull().default("home"),
    elementId: text("element_id").notNull(),
    payload: jsonb("payload").$type<Record<string, string>>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("form_submissions_site_idx").on(t.websiteId, t.createdAt)],
);

export const guestbookEntries = pgTable(
  "guestbook_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    elementId: text("element_id").notNull(),
    name: text("name").notNull(),
    message: text("message").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("guestbook_site_idx").on(t.websiteId, t.elementId), index("guestbook_site_element_created_idx").on(t.websiteId, t.elementId, t.createdAt)],
);

export const websiteLikes = pgTable(
  "website_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.websiteId] })],
);

export const websiteSaves = pgTable(
  "website_saves",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.websiteId] })],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: ts("resolved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status)],
);

export const teamApplications = pgTable("team_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  roleInterest: text("role_interest").notNull(),
  portfolioUrl: text("portfolio_url"),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const shortLinks = pgTable("short_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  websiteId: uuid("website_id")
    .notNull()
    .references(() => websites.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});
