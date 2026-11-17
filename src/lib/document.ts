import { createHash, randomUUID } from "crypto";
import { BASIC_MOTION, ELEMENT_TYPES, PLUS_MOTION, PRO_MOTION, TIER_RANK } from "./constants";
import type {
  Box,
  ElementNode,
  ElementStyle,
  MotionConfig,
  PageDoc,
  PlanFeatures,
  SectionNode,
  ThemeDoc,
  WebsiteDocument,
} from "./types";

export const CANVAS = { desktop: 1280, tablet: 834, mobile: 390 };
const TYPES = new Set<string>(ELEMENT_TYPES);
const COLOR = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(0|1|0?\.\d+))?\s*\)|transparent)$/;
const SHADOW = /^(none|0?\.\d+px|[\d.]+px)(\s+[\d.]+px){1,3}(\s+rgba?\([^)]+\)|\s+#[0-9a-fA-F]{3,8})?$/;

export function uid() {
  return randomUUID();
}

export function defaultTheme(): ThemeDoc {
  return {
    ink: "#161616",
    paper: "#f6f3ee",
    accent: "#ff4d1c",
    muted: "#6f6a64",
    surface: "#ffffff",
    displayFont: "Syne",
    bodyFont: "Outfit",
    radius: 18,
    shadow: "0 18px 40px rgba(18,18,18,0.12)",
    spacing: 24,
  };
}

export function blankDocument(name = "Home"): WebsiteDocument {
  return {
    version: 1,
    theme: defaultTheme(),
    pages: [
      {
        id: uid(),
        name,
        slug: "home",
        background: "#f6f3ee",
        sections: [
          {
            id: uid(),
            name: "Hero",
            locked: false,
            hidden: false,
            height: 640,
            background: "#141414",
            elements: [
              makeElement(
                "heading",
                { x: 72, y: 160, w: 720, h: 140 },
                { text: "Build something precise." },
                { color: "#ffffff", fontSize: 64, fontWeight: 760, fontFamily: "Syne", lineHeight: 0.95 },
                "Headline",
              ),
              makeElement(
                "paragraph",
                { x: 72, y: 320, w: 520, h: 90 },
                { text: "Start from a blank canvas. Add sections, motion, and pages — then publish a link that is yours." },
                { color: "#d7d2cb", fontSize: 18, lineHeight: 1.5, fontFamily: "Outfit" },
                "Intro",
              ),
              makeElement(
                "button",
                { x: 72, y: 430, w: 180, h: 52 },
                { label: "Begin", href: "#", action: "none" },
                { background: "#ff4d1c", color: "#ffffff", radius: 999, fontWeight: 700, fontSize: 15, textAlign: "center" },
                "Button",
              ),
            ],
          },
        ],
      },
    ],
    components: [],
    assets: [],
    ignoredAdvice: [],
    settings: { skipIntro: true, reducedMotion: false, lazyImages: true, lowEndFallback: true },
  };
}

export function makeElement(
  type: string,
  box: Partial<Box> & { x: number; y: number; w: number; h: number },
  content: Record<string, unknown>,
  style: ElementStyle = {},
  name?: string,
): ElementNode {
  return {
    id: uid(),
    type,
    name: name || type,
    locked: false,
    hidden: false,
    box: { r: 0, z: 1, ...box },
    style,
    content,
  };
}

export function hashDocument(doc: WebsiteDocument) {
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

export function cloneDocument(doc: WebsiteDocument): WebsiteDocument {
  const copy = JSON.parse(JSON.stringify(doc)) as WebsiteDocument;
  const map = new Map<string, string>();
  const next = (id: string) => {
    if (!map.has(id)) map.set(id, uid());
    return map.get(id)!;
  };
  for (const page of copy.pages) {
    page.id = next(page.id);
    for (const section of page.sections) {
      section.id = next(section.id);
      for (const element of section.elements) {
        element.id = next(element.id);
        if (element.groupId) element.groupId = next(element.groupId);
      }
    }
  }
  for (const component of copy.components || []) {
    component.id = next(component.id);
    for (const element of component.elements) element.id = next(element.id);
  }
  copy.ignoredAdvice = [];
  return copy;
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function cleanColor(value: unknown) {
  if (typeof value !== "string") return undefined;
  const v = value.trim().slice(0, 40);
  return COLOR.test(v) ? v : undefined;
}

function cleanStyle(style: ElementStyle | undefined): ElementStyle {
  if (!style || typeof style !== "object") return {};
  const next: ElementStyle = {};
  const color = cleanColor(style.color);
  const background = cleanColor(style.background);
  const borderColor = cleanColor(style.borderColor);
  if (color) next.color = color;
  if (background) next.background = background;
  if (borderColor) next.borderColor = borderColor;
  if (typeof style.gradient === "string" && /^linear-gradient\([^;{}]{0,180}\)$/.test(style.gradient)) next.gradient = style.gradient;
  if (typeof style.fontFamily === "string") next.fontFamily = style.fontFamily.replace(/[^a-zA-Z0-9 \-,]/g, "").slice(0, 60);
  if (typeof style.fontSize === "number") next.fontSize = clamp(style.fontSize, 8, 160);
  if (typeof style.fontWeight === "number") next.fontWeight = clamp(style.fontWeight, 300, 800);
  if (typeof style.lineHeight === "number") next.lineHeight = clamp(style.lineHeight, 0.8, 2.4);
  if (typeof style.letterSpacing === "number") next.letterSpacing = clamp(style.letterSpacing, -4, 20);
  if (style.textAlign === "left" || style.textAlign === "center" || style.textAlign === "right" || style.textAlign === "start") next.textAlign = style.textAlign;
  if (typeof style.radius === "number") next.radius = clamp(style.radius, 0, 999);
  if (typeof style.shadow === "string" && (style.shadow === "none" || SHADOW.test(style.shadow))) next.shadow = style.shadow;
  if (typeof style.borderWidth === "number") next.borderWidth = clamp(style.borderWidth, 0, 24);
  if (typeof style.opacity === "number") next.opacity = clamp(style.opacity, 0, 1);
  if (typeof style.padding === "number") next.padding = clamp(style.padding, 0, 120);
  if (style.objectFit === "cover" || style.objectFit === "contain") next.objectFit = style.objectFit;
  if (typeof style.blur === "number") next.blur = clamp(style.blur, 0, 40);
  return next;
}

export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim().slice(0, 500);
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (url.startsWith("#")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:") return url;
  } catch {
    return null;
  }
  return null;
}

export function youtubeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const match = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/) || raw.match(/^([A-Za-z0-9_-]{11})$/);
  return match?.[1] || null;
}

function cleanText(value: unknown, max = 4000) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
}

function cleanMotion(motion: MotionConfig | undefined): MotionConfig | undefined {
  if (!motion || typeof motion !== "object") return undefined;
  const presets = new Set(["none", "fade", "slide", "zoom", "rotate", "scale", "parallax", "cinematic", "typewriter", "morph", "particles"]);
  const preset = presets.has(motion.preset) ? motion.preset : "none";
  const keyframes = Array.isArray(motion.keyframes)
    ? motion.keyframes.slice(0, 12).map((frame) => ({
        t: clamp(Number(frame.t) || 0, 0, 100),
        opacity: frame.opacity === undefined ? undefined : clamp(Number(frame.opacity), 0, 1),
        x: frame.x === undefined ? undefined : clamp(Number(frame.x), -800, 800),
        y: frame.y === undefined ? undefined : clamp(Number(frame.y), -800, 800),
        scale: frame.scale === undefined ? undefined : clamp(Number(frame.scale), 0, 4),
        rotate: frame.rotate === undefined ? undefined : clamp(Number(frame.rotate), -360, 360),
        rotateX: frame.rotateX === undefined ? undefined : clamp(Number(frame.rotateX), -180, 180),
        rotateY: frame.rotateY === undefined ? undefined : clamp(Number(frame.rotateY), -180, 180),
      }))
    : [];
  return {
    preset,
    duration: clamp(Number(motion.duration) || 600, 0, 20000),
    delay: clamp(Number(motion.delay) || 0, 0, 20000),
    easing: ["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(motion.easing) ? motion.easing : "ease-out",
    trigger: ["load", "scroll", "hover", "click"].includes(motion.trigger) ? motion.trigger : "load",
    iterations: clamp(Number(motion.iterations) || 1, 1, 20),
    infinite: Boolean(motion.infinite),
    slideFrom: ["left", "right", "up", "down"].includes(motion.slideFrom || "") ? motion.slideFrom : "up",
    parallax: clamp(Number(motion.parallax) || 0.2, -1, 1),
    keyframes,
  };
}

function cleanBox(box: Partial<Box> | undefined, fallback: Box): Box {
  return {
    x: clamp(Number(box?.x ?? fallback.x), -2000, 4000),
    y: clamp(Number(box?.y ?? fallback.y), -2000, 8000),
    w: clamp(Number(box?.w ?? fallback.w), 8, 2000),
    h: clamp(Number(box?.h ?? fallback.h), 8, 4000),
    r: clamp(Number(box?.r ?? fallback.r), -360, 360),
    z: clamp(Number(box?.z ?? fallback.z), 0, 200),
  };
}

function cleanContent(type: string, content: Record<string, unknown> | undefined) {
  const source = content && typeof content === "object" ? content : {};
  const text = cleanText(source.text, 5000);
  if (type === "heading" || type === "text" || type === "paragraph" || type === "icon") return { text: text || (type === "icon" ? "✦" : "Text") };
  if (type === "image") return { src: safeUrl(source.src) || "", alt: cleanText(source.alt, 180) };
  if (type === "button") {
    return {
      label: cleanText(source.label, 80) || "Button",
      href: safeUrl(source.href) || "#",
      action: ["link", "page", "reveal", "none"].includes(String(source.action)) ? source.action : "link",
      pageSlug: slugPiece(source.pageSlug),
      newTab: Boolean(source.newTab),
    };
  }
  if (type === "video") return { youtubeId: youtubeId(source.youtubeId) || "", title: cleanText(source.title, 120) };
  if (type === "shape") return { shape: ["rect", "circle", "triangle", "blob"].includes(String(source.shape)) ? source.shape : "rect" };
  if (type === "card") return { title: cleanText(source.title, 120), body: cleanText(source.body, 600), image: safeUrl(source.image) || "" };
  if (type === "gallery" || type === "slider") {
    const images = Array.isArray(source.images) ? source.images.slice(0, 12) : [];
    return {
      title: cleanText(source.title, 120),
      images: images
        .map((item) => {
          const row = item as { src?: string; alt?: string; caption?: string };
          const src = safeUrl(row?.src);
          return src ? { src, alt: cleanText(row.alt, 160), caption: cleanText(row.caption, 160) } : null;
        })
        .filter(Boolean),
    };
  }
  if (type === "form") {
    const fields = Array.isArray(source.fields) ? source.fields.slice(0, 8) : [{ id: "name", label: "Name", type: "text", required: true }];
    return {
      title: cleanText(source.title, 120),
      success: cleanText(source.success, 200) || "Received. Thank you.",
      submitLabel: cleanText(source.submitLabel, 40) || "Send",
      fields: fields.map((field, index) => {
        const row = field as { id?: string; label?: string; type?: string; required?: boolean };
        return {
          id: slugPiece(row.id) || `field-${index + 1}`,
          label: cleanText(row.label, 60) || "Field",
          type: ["text", "email", "textarea"].includes(String(row.type)) ? row.type : "text",
          required: Boolean(row.required),
        };
      }),
    };
  }
  if (type === "navbar" || type === "footer" || type === "social") {
    const links = Array.isArray(source.links) ? source.links.slice(0, 8) : [];
    return {
      brand: cleanText(source.brand || source.text, 60),
      text: cleanText(source.text, 240),
      links: links.map((link) => {
        const row = link as { label?: string; href?: string; network?: string; url?: string };
        return {
          label: cleanText(row.label || row.network, 40),
          href: safeUrl(row.href || row.url) || "#",
          network: cleanText(row.network, 24),
          url: safeUrl(row.url || row.href) || "#",
        };
      }),
    };
  }
  if (type === "countdown") return { target: cleanText(source.target, 40), label: cleanText(source.label, 80), done: cleanText(source.done, 160) };
  if (type === "timeline" || type === "testimonials") {
    const items = Array.isArray(source.items) ? source.items.slice(0, 8) : [];
    return {
      title: cleanText(source.title, 120),
      items: items.map((item) => {
        const row = item as { year?: string; title?: string; body?: string; quote?: string; name?: string; role?: string };
        return {
          year: cleanText(row.year, 20),
          title: cleanText(row.title, 80),
          body: cleanText(row.body, 300),
          quote: cleanText(row.quote, 300),
          name: cleanText(row.name, 60),
          role: cleanText(row.role, 60),
        };
      }),
    };
  }
  if (type === "quiz") {
    const questions = Array.isArray(source.questions) ? source.questions.slice(0, 8) : [];
    return {
      title: cleanText(source.title, 120),
      questions: questions.map((question) => {
        const row = question as { q?: string; options?: string[]; answer?: number };
        return {
          q: cleanText(row.q, 180),
          options: (row.options || []).slice(0, 4).map((option) => cleanText(option, 80)),
          answer: clamp(Number(row.answer) || 0, 0, 3),
        };
      }),
    };
  }
  if (type === "treasure") {
    const clues = Array.isArray(source.clues) ? source.clues.slice(0, 6) : [];
    return {
      title: cleanText(source.title, 120),
      clues: clues.map((clue) => {
        const row = clue as { text?: string; answer?: string };
        return { text: cleanText(row.text, 240), answer: cleanText(row.answer, 60) };
      }),
    };
  }
  if (type === "surprise") return { title: cleanText(source.title, 80), message: cleanText(source.message, 400), button: cleanText(source.button, 40) || "Open" };
  if (type === "guestbook") return { title: cleanText(source.title, 80) || "Guestbook" };
  if (type === "wheel") {
    const segments = Array.isArray(source.segments) ? source.segments.slice(0, 8) : [];
    return {
      title: cleanText(source.title, 80),
      segments: segments.map((segment, index) => {
        const row = segment as { label?: string; color?: string };
        return { label: cleanText(row.label, 24) || `Prize ${index + 1}`, color: cleanColor(row.color) || (index % 2 ? "#ff4d1c" : "#161616") };
      }),
    };
  }
  if (type === "particles") return { density: clamp(Number(source.density) || 24, 8, 60), color: cleanColor(source.color) || "#ff4d1c" };
  if (type === "container") return { label: cleanText(source.label, 80) };
  return { text };
}

function slugPiece(value: unknown) {
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
}

export function assertDocument(input: unknown): WebsiteDocument {
  if (!input || typeof input !== "object") throw new Error("Invalid document");
  const raw = input as WebsiteDocument;
  if (raw.version !== 1) throw new Error("Unsupported document version");
  if (!Array.isArray(raw.pages) || raw.pages.length < 1 || raw.pages.length > 30) throw new Error("A website needs between 1 and 30 pages");
  const slugs = new Set<string>();
  let elements = 0;
  const pages: PageDoc[] = raw.pages.map((page, pageIndex) => {
    const slug = slugPiece(page.slug) || `page-${pageIndex + 1}`;
    if (slugs.has(slug)) throw new Error("Page slugs must be unique");
    slugs.add(slug);
    if (!Array.isArray(page.sections) || page.sections.length > 30) throw new Error("Too many sections");
    const sections: SectionNode[] = page.sections.map((section, sectionIndex) => {
      const list = Array.isArray(section.elements) ? section.elements.slice(0, 80) : [];
      elements += list.length;
      return {
        id: typeof section.id === "string" ? section.id.slice(0, 80) : uid(),
        name: cleanText(section.name, 60) || `Section ${sectionIndex + 1}`,
        locked: Boolean(section.locked),
        hidden: Boolean(section.hidden),
        height: clamp(Number(section.height) || 480, 80, 2400),
        tabletHeight: section.tabletHeight ? clamp(Number(section.tabletHeight), 80, 2400) : undefined,
        mobileHeight: section.mobileHeight ? clamp(Number(section.mobileHeight), 80, 3200) : undefined,
        background: cleanColor(section.background) || "#ffffff",
        elements: list.map((element, elementIndex) => {
          if (!TYPES.has(element.type)) throw new Error("Unknown element type");
          const fallback: Box = { x: 24, y: 24, w: 240, h: 80, r: 0, z: elementIndex + 1 };
          return {
            id: typeof element.id === "string" ? element.id.slice(0, 80) : uid(),
            type: element.type,
            name: cleanText(element.name, 60) || element.type,
            locked: Boolean(element.locked),
            hidden: Boolean(element.hidden),
            groupId: element.groupId ? String(element.groupId).slice(0, 80) : undefined,
            box: cleanBox(element.box, fallback),
            tablet: element.tablet ? cleanBox(element.tablet, fallback) : undefined,
            mobile: element.mobile ? cleanBox(element.mobile, fallback) : undefined,
            style: cleanStyle(element.style),
            tabletStyle: element.tabletStyle ? cleanStyle(element.tabletStyle) : undefined,
            mobileStyle: element.mobileStyle ? cleanStyle(element.mobileStyle) : undefined,
            content: cleanContent(element.type, element.content),
            motion: cleanMotion(element.motion),
          };
        }),
      };
    });
    return {
      id: typeof page.id === "string" ? page.id.slice(0, 80) : uid(),
      name: cleanText(page.name, 60) || `Page ${pageIndex + 1}`,
      slug,
      background: cleanColor(page.background) || "#f6f3ee",
      intro: page.intro
        ? {
            enabled: Boolean(page.intro.enabled),
            title: cleanText(page.intro.title, 80),
            subtitle: cleanText(page.intro.subtitle, 160),
            seconds: clamp(Number(page.intro.seconds) || 4, 1, 12),
          }
        : undefined,
      sections,
    };
  });
  if (elements > 500) throw new Error("Element limit reached");
  const theme = raw.theme || defaultTheme();
  const doc: WebsiteDocument = {
    version: 1,
    theme: {
      ink: cleanColor(theme.ink) || "#161616",
      paper: cleanColor(theme.paper) || "#f6f3ee",
      accent: cleanColor(theme.accent) || "#ff4d1c",
      muted: cleanColor(theme.muted) || "#6f6a64",
      surface: cleanColor(theme.surface) || "#ffffff",
      displayFont: cleanText(theme.displayFont, 40) || "Syne",
      bodyFont: cleanText(theme.bodyFont, 40) || "Outfit",
      radius: clamp(Number(theme.radius) || 18, 0, 48),
      shadow: typeof theme.shadow === "string" ? theme.shadow.slice(0, 80) : defaultTheme().shadow,
      spacing: clamp(Number(theme.spacing) || 24, 0, 80),
    },
    pages,
    components: Array.isArray(raw.components)
      ? raw.components.slice(0, 30).map((component) => ({
          id: String(component.id || uid()).slice(0, 80),
          name: cleanText(component.name, 60) || "Component",
          elements: (component.elements || []).slice(0, 20),
        }))
      : [],
    assets: Array.isArray(raw.assets)
      ? raw.assets.slice(0, 80).map((asset) => ({
          id: String(asset.id || uid()).slice(0, 80),
          url: safeUrl(asset.url) || "",
          name: cleanText(asset.name, 80),
        })).filter((asset) => asset.url)
      : [],
    ignoredAdvice: Array.isArray(raw.ignoredAdvice) ? raw.ignoredAdvice.map(String).slice(0, 100) : [],
    settings: {
      skipIntro: raw.settings?.skipIntro !== false,
      reducedMotion: Boolean(raw.settings?.reducedMotion),
      lazyImages: raw.settings?.lazyImages !== false,
      lowEndFallback: raw.settings?.lowEndFallback !== false,
    },
  };
  if (JSON.stringify(doc).length > 1_400_000) throw new Error("Document is too large");
  return doc;
}

export function resolveBox(element: ElementNode, breakpoint: "desktop" | "tablet" | "mobile"): Box {
  if (breakpoint === "desktop") return element.box;
  const custom = breakpoint === "tablet" ? element.tablet : element.mobile;
  if (custom && custom.w && custom.h && custom.x !== undefined && custom.y !== undefined) {
    return { ...element.box, ...custom, r: custom.r ?? element.box.r, z: custom.z ?? element.box.z };
  }
  const scale = CANVAS[breakpoint] / CANVAS.desktop;
  return {
    x: Math.round(element.box.x * scale),
    y: Math.round(element.box.y * scale),
    w: Math.max(8, Math.round(element.box.w * scale)),
    h: Math.max(8, Math.round(element.box.h * scale)),
    r: element.box.r,
    z: element.box.z,
  };
}

export function resolveStyle(element: ElementNode, breakpoint: "desktop" | "tablet" | "mobile"): ElementStyle {
  if (breakpoint === "tablet") return { ...element.style, ...element.tabletStyle };
  if (breakpoint === "mobile") return { ...element.style, ...element.mobileStyle };
  return element.style;
}

export function sectionHeight(section: SectionNode, breakpoint: "desktop" | "tablet" | "mobile") {
  if (breakpoint === "tablet" && section.tabletHeight) return section.tabletHeight;
  if (breakpoint === "mobile" && section.mobileHeight) return section.mobileHeight;
  const scale = CANVAS[breakpoint] / CANVAS.desktop;
  return breakpoint === "desktop" ? section.height : Math.round(section.height * scale);
}

export function motionAllowed(preset: string | undefined, features: PlanFeatures) {
  if (!preset || preset === "none") return true;
  if (BASIC_MOTION.has(preset)) return features.basicMotion;
  if (PLUS_MOTION.has(preset)) return features.advancedTransitions || features.motionEditor;
  if (preset === "parallax") return features.parallax;
  if (preset === "particles") return features.motionEditor;
  return features.motionEditor;
}

export function elementAllowed(type: string, features: PlanFeatures) {
  if (["gallery", "slider"].includes(type)) return features.galleries;
  if (type === "countdown") return features.countdown;
  if (["quiz", "treasure", "wheel", "guestbook", "surprise"].includes(type)) return features.games;
  return true;
}

export function gatedSignature(doc: WebsiteDocument) {
  const signatures: string[] = [];
  for (const page of doc.pages) {
    for (const section of page.sections) {
      for (const element of section.elements) {
        const preset = element.motion?.preset;
        if (!elementAllowed(element.type, { ...blankAllow(), galleries: false, countdown: false, games: false })) {
          signatures.push(`${element.id}:type:${element.type}`);
        }
        if (preset && preset !== "none" && !BASIC_MOTION.has(preset)) signatures.push(`${element.id}:motion:${preset}`);
        if ((element.motion?.keyframes?.length || 0) > 0) signatures.push(`${element.id}:keyframes`);
        if (element.motion?.keyframes?.some((frame) => frame.rotateX || frame.rotateY)) signatures.push(`${element.id}:3d`);
      }
    }
  }
  return signatures;
}

function blankAllow(): PlanFeatures {
  return {
    maxWebsites: 0,
    templateTier: "free",
    basicMotion: true,
    advancedTransitions: false,
    galleries: true,
    countdown: true,
    games: true,
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

export function findNewViolations(previous: WebsiteDocument | null, next: WebsiteDocument, features: PlanFeatures) {
  const before = new Set(previous ? gatedSignature(previous) : []);
  const problems: string[] = [];
  for (const page of next.pages) {
    for (const section of page.sections) {
      for (const element of section.elements) {
        if (!elementAllowed(element.type, features) && !before.has(`${element.id}:type:${element.type}`)) {
          problems.push(`${element.name} requires a higher plan`);
        }
        const preset = element.motion?.preset;
        if (preset && !motionAllowed(preset, features) && !before.has(`${element.id}:motion:${preset}`)) {
          problems.push(`${preset} motion requires a higher plan`);
        }
        if ((element.motion?.keyframes?.length || 0) > 0 && !features.timeline && !before.has(`${element.id}:keyframes`)) {
          problems.push("Keyframes require Pro");
        }
        if (element.motion?.keyframes?.some((frame) => frame.rotateX || frame.rotateY) && !features.threeD && !before.has(`${element.id}:3d`)) {
          problems.push("3D transforms require Pro");
        }
      }
    }
  }
  return problems;
}

export function tierAllows(userTier: string, templateTier: string) {
  return (TIER_RANK[userTier] ?? 0) >= (TIER_RANK[templateTier] ?? 0);
}

export function pageBySlug(doc: WebsiteDocument, slug?: string) {
  if (!slug || slug === "home") return doc.pages[0];
  return doc.pages.find((page) => page.slug === slug) || null;
}
