export type RoleKey = "user" | "designer" | "reviewer" | "support" | "admin" | "owner";

export type PlanKey = "free" | "plus" | "pro" | "designer";

export type WebsiteStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "SCHEDULED" | "EXPIRED";

export type TemplateStatus =
  | "DRAFT"
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED"
  | "SUSPENDED";

export interface PlanFeatures {
  maxWebsites: number;
  templateTier: "free" | "plus" | "pro";
  basicMotion: boolean;
  advancedTransitions: boolean;
  galleries: boolean;
  countdown: boolean;
  games: boolean;
  analytics: "basic" | "advanced";
  branding: boolean;
  customDomain: boolean;
  passwordProtection: boolean;
  customSlug: boolean;
  scheduledPublishing: boolean;
  versionHistory: number;
  motionEditor: boolean;
  timeline: boolean;
  threeD: boolean;
  parallax: boolean;
  canCreateTemplates: boolean;
  marketplace: boolean;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  z: number;
}

export interface MotionKeyframe {
  t: number;
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  rotateX?: number;
  rotateY?: number;
}

export type MotionPreset =
  | "none"
  | "fade"
  | "slide"
  | "zoom"
  | "rotate"
  | "scale"
  | "parallax"
  | "cinematic"
  | "typewriter"
  | "morph"
  | "particles";

export interface MotionConfig {
  preset: MotionPreset;
  duration: number;
  delay: number;
  easing: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
  trigger: "load" | "scroll" | "hover" | "click";
  iterations: number;
  infinite: boolean;
  slideFrom?: "left" | "right" | "up" | "down";
  parallax?: number;
  keyframes: MotionKeyframe[];
}

export interface ElementStyle {
  color?: string;
  background?: string;
  gradient?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right" | "start";
  radius?: number;
  shadow?: string;
  borderWidth?: number;
  borderColor?: string;
  opacity?: number;
  padding?: number;
  objectFit?: "cover" | "contain";
  blur?: number;
}

export interface ElementNode {
  id: string;
  type: string;
  name: string;
  locked: boolean;
  hidden: boolean;
  groupId?: string;
  box: Box;
  tablet?: Partial<Box>;
  mobile?: Partial<Box>;
  style: ElementStyle;
  tabletStyle?: Partial<ElementStyle>;
  mobileStyle?: Partial<ElementStyle>;
  content: Record<string, unknown>;
  motion?: MotionConfig;
}

export interface SectionNode {
  id: string;
  name: string;
  locked: boolean;
  hidden: boolean;
  height: number;
  tabletHeight?: number;
  mobileHeight?: number;
  background: string;
  elements: ElementNode[];
}

export interface PageIntro {
  enabled: boolean;
  title: string;
  subtitle: string;
  seconds: number;
}

export interface PageDoc {
  id: string;
  name: string;
  slug: string;
  background: string;
  intro?: PageIntro;
  sections: SectionNode[];
}

export interface ThemeDoc {
  ink: string;
  paper: string;
  accent: string;
  muted: string;
  surface: string;
  displayFont: string;
  bodyFont: string;
  radius: number;
  shadow: string;
  spacing: number;
}

export interface ComponentDef {
  id: string;
  name: string;
  elements: ElementNode[];
}

export interface WebsiteDocument {
  version: 1;
  theme: ThemeDoc;
  pages: PageDoc[];
  components: ComponentDef[];
  assets: { id: string; url: string; name: string }[];
  ignoredAdvice: string[];
  settings: {
    skipIntro: boolean;
    reducedMotion: boolean;
    lazyImages: boolean;
    lowEndFallback: boolean;
  };
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string;
  headline: string;
  role: string;
  status: string;
  locale: string;
  createdAt: string;
}

export interface SessionUser extends PublicUser {
  permissions: string[];
  planKey: PlanKey;
  features: PlanFeatures;
  subscriptionStatus: string;
  periodEnd: string | null;
}
