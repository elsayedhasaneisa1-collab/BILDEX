import type { PlanFeatures, PlanKey } from "./types";

export const APP_NAME = "BUILDEX";
export const TAGLINE = "Build Beyond Limits.";

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "dashboard",
  "login",
  "register",
  "s",
  "studio",
  "templates",
  "designers",
  "pricing",
  "explore",
  "checkout",
  "verify",
  "l",
  "help",
  "legal",
  "about",
  "contact",
  "features",
  "faq",
  "join",
  "academy",
  "updates",
  "id-card",
  "designer",
  "preview",
  "forgot-password",
  "reset-password",
  "icon",
  "media",
  "brand",
  "offline",
  "manifest",
  "robots",
  "sitemap",
  "owner",
  "support",
  "www",
  "app",
  "static",
  "assets",
  "auth",
  "settings",
  "account",
  "billing",
  "null",
  "undefined",
]);

export const ELEMENT_TYPES = [
  "heading",
  "text",
  "paragraph",
  "image",
  "button",
  "video",
  "icon",
  "shape",
  "container",
  "card",
  "gallery",
  "slider",
  "form",
  "navbar",
  "footer",
  "countdown",
  "timeline",
  "testimonials",
  "social",
  "quiz",
  "treasure",
  "surprise",
  "guestbook",
  "wheel",
  "particles",
  "divider",
  "spacer",
] as const;

export const BASIC_MOTION = new Set(["fade", "slide"]);
export const PLUS_MOTION = new Set(["zoom", "rotate", "scale", "cinematic", "typewriter", "morph"]);
export const PRO_MOTION = new Set(["parallax", "particles"]);

export const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 };

export const ROLE_DEFAULTS: Record<string, string[]> = {
  user: ["websites.manage", "support.create", "profile.manage"],
  designer: [
    "websites.manage",
    "support.create",
    "profile.manage",
    "templates.create",
    "payouts.request",
  ],
  reviewer: ["templates.review", "profile.manage", "support.create"],
  support: ["support.manage", "profile.manage", "reports.manage"],
  admin: [
    "websites.manage",
    "websites.moderate",
    "templates.create",
    "templates.review",
    "templates.publish",
    "users.manage",
    "designers.manage",
    "team.manage",
    "subscriptions.manage",
    "payments.manage",
    "payments.refund",
    "payouts.manage",
    "support.manage",
    "reports.manage",
    "notifications.broadcast",
    "audit.read",
    "plans.manage",
    "coupons.manage",
    "analytics.read",
    "settings.manage",
    "maintenance.manage",
    "profile.manage",
  ],
  owner: ["*"],
};

export const ALL_PERMISSIONS = [
  "websites.manage",
  "websites.moderate",
  "templates.create",
  "templates.review",
  "templates.publish",
  "users.manage",
  "designers.manage",
  "team.manage",
  "subscriptions.manage",
  "payments.manage",
  "payments.refund",
  "payouts.manage",
  "payouts.request",
  "support.manage",
  "support.create",
  "reports.manage",
  "notifications.broadcast",
  "audit.read",
  "plans.manage",
  "coupons.manage",
  "settings.manage",
  "maintenance.manage",
  "analytics.read",
  "profile.manage",
];

export const STAFF_ROLES = new Set(["reviewer", "support", "admin", "owner"]);

export function freeFeatures(): PlanFeatures {
  return {
    maxWebsites: 1,
    templateTier: "free",
    basicMotion: true,
    advancedTransitions: false,
    galleries: false,
    countdown: false,
    games: false,
    analytics: "basic",
    branding: true,
    customDomain: false,
    passwordProtection: false,
    customSlug: false,
    scheduledPublishing: false,
    versionHistory: 0,
    motionEditor: false,
    timeline: false,
    threeD: false,
    parallax: false,
    canCreateTemplates: false,
    marketplace: false,
  };
}

export function featuresFor(key: PlanKey): PlanFeatures {
  if (key === "plus") {
    return {
      ...freeFeatures(),
      maxWebsites: 5,
      templateTier: "plus",
      advancedTransitions: true,
      galleries: true,
      countdown: true,
      games: true,
      analytics: "advanced",
      versionHistory: 5,
    };
  }
  if (key === "pro") {
    return {
      ...featuresFor("plus"),
      maxWebsites: 15,
      templateTier: "pro",
      branding: false,
      customDomain: true,
      passwordProtection: true,
      customSlug: true,
      scheduledPublishing: true,
      versionHistory: 30,
      motionEditor: true,
      timeline: true,
      threeD: true,
      parallax: true,
    };
  }
  if (key === "designer") {
    return {
      ...featuresFor("plus"),
      maxWebsites: 8,
      canCreateTemplates: true,
      marketplace: true,
    };
  }
  return freeFeatures();
}

export const PLAN_COPY: Record<PlanKey, { name: string; blurb: string }> = {
  free: {
    name: "Free",
    blurb: "One site, free templates, basic motion, and the BUILDEX mark.",
  },
  plus: {
    name: "Plus",
    blurb: "Five sites, galleries, countdowns, selected games, and richer stats.",
  },
  pro: {
    name: "Pro",
    blurb: "Motion editor, timeline, 3D, domains, passwords, and no platform mark.",
  },
  designer: {
    name: "Designer",
    blurb: "Create templates, track sales, and request payouts. Not an admin role.",
  },
};
