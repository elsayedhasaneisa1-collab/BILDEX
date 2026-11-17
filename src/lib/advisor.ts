import type { WebsiteDocument } from "./types";

export interface Advice {
  id: string;
  title: string;
  reason: string;
  benefit: string;
  auto: boolean;
}

export function adviseDocument(doc: WebsiteDocument, category = "personal"): Advice[] {
  const advice: Advice[] = [];
  const elements = doc.pages.flatMap((page) => page.sections.flatMap((section) => section.elements.filter((element) => !element.hidden)));
  const buttons = elements.filter((element) => element.type === "button");
  const motions = elements.filter((element) => element.motion && element.motion.preset !== "none");
  const hasTestimonials = elements.some((element) => element.type === "testimonials");
  const hasNav = elements.some((element) => element.type === "navbar");
  const smallMobile = elements.filter((element) => (element.mobileStyle?.fontSize || element.style.fontSize || 16) < 14 && ["paragraph", "text"].includes(element.type));
  if (!buttons.length) {
    advice.push({
      id: "cta",
      title: "Add a clear action",
      reason: "The page explains itself but never asks for the next step.",
      benefit: "A single button gives visitors a place to land.",
      auto: true,
    });
  }
  if (!hasNav && doc.pages[0] && doc.pages[0].sections.length > 2) {
    advice.push({
      id: "nav",
      title: "Add navigation",
      reason: "Long pages without a navbar hide the structure.",
      benefit: "Visitors can jump instead of hunting.",
      auto: true,
    });
  }
  if (motions.length > 6) {
    advice.push({
      id: "calm",
      title: "Reduce motion",
      reason: `${motions.length} simultaneous effects compete for attention and battery.`,
      benefit: "Keeping motion on the opening section makes the rest easier to read.",
      auto: true,
    });
  }
  if (smallMobile.length) {
    advice.push({
      id: "type",
      title: "Enlarge mobile text",
      reason: "Some paragraphs are under 14px on the phone layout.",
      benefit: "Reading speed and accessibility both improve.",
      auto: true,
    });
  }
  if (!hasTestimonials && ["business", "restaurant", "services", "product"].includes(category)) {
    advice.push({
      id: "proof",
      title: "Add proof",
      reason: "Business pages convert better when a real quote sits near the offer.",
      benefit: "A short testimonial section makes the claim specific.",
      auto: true,
    });
  }
  const accentUsed = elements.some((element) => element.style.background === doc.theme.accent || element.style.color === doc.theme.accent);
  if (!accentUsed) {
    advice.push({
      id: "accent",
      title: "Use the accent color once",
      reason: "The theme accent is defined but never applied.",
      benefit: "One orange action makes the hierarchy obvious.",
      auto: true,
    });
  }
  const ys = elements.map((element) => element.box.y).sort((a, b) => a - b);
  if (ys.length > 4) {
    const gaps = ys.slice(1).map((y, index) => y - ys[index]);
    const varied = gaps.filter((gap) => gap > 0 && (gap < 8 || gap > 180)).length;
    if (varied > 3) {
      advice.push({
        id: "rhythm",
        title: "Even out vertical rhythm",
        reason: "Gaps between elements jump between cramped and loose.",
        benefit: "A steadier cadence makes the page feel designed rather than stacked.",
        auto: true,
      });
    }
  }
  return advice.filter((item) => !doc.ignoredAdvice.includes(item.id));
}

export function applyAdvice(doc: WebsiteDocument, id: string): WebsiteDocument {
  const next = structuredClone(doc);
  const page = next.pages[0];
  if (!page) return next;
  if (id === "cta") {
    const section = page.sections[page.sections.length - 1];
    if (section) {
      section.elements.push({
        id: crypto.randomUUID(),
        type: "button",
        name: "Primary action",
        locked: false,
        hidden: false,
        box: { x: 72, y: Math.max(24, section.height - 90), w: 200, h: 52, r: 0, z: 8 },
        style: { background: next.theme.accent, color: "#ffffff", radius: 999, fontWeight: 700, textAlign: "center", fontSize: 15 },
        content: { label: "Continue", href: "#", action: "none" },
      });
    }
  }
  if (id === "nav") {
    page.sections.unshift({
      id: crypto.randomUUID(),
      name: "Navigation",
      locked: false,
      hidden: false,
      height: 84,
      background: next.theme.ink,
      elements: [
        {
          id: crypto.randomUUID(),
          type: "navbar",
          name: "Navbar",
          locked: false,
          hidden: false,
          box: { x: 28, y: 16, w: 1224, h: 52, r: 0, z: 4 },
          style: { color: "#ffffff", fontSize: 15, fontWeight: 650 },
          content: { brand: "Site", links: [{ label: "Top", href: "#top" }] },
        },
      ],
    });
  }
  if (id === "calm") {
    let index = 0;
    for (const sitePage of next.pages) {
      for (const section of sitePage.sections) {
        for (const element of section.elements) {
          if (!element.motion || element.motion.preset === "none") continue;
          index += 1;
          if (index > 3) element.motion.preset = "none";
        }
      }
    }
  }
  if (id === "type") {
    for (const sitePage of next.pages) {
      for (const section of sitePage.sections) {
        for (const element of section.elements) {
          if (["paragraph", "text"].includes(element.type)) {
            element.mobileStyle = { ...element.mobileStyle, fontSize: Math.max(16, element.style.fontSize || 16) };
          }
        }
      }
    }
  }
  if (id === "proof") {
    page.sections.push({
      id: crypto.randomUUID(),
      name: "Proof",
      locked: false,
      hidden: false,
      height: 320,
      background: next.theme.surface,
      elements: [
        {
          id: crypto.randomUUID(),
          type: "testimonials",
          name: "Testimonials",
          locked: false,
          hidden: false,
          box: { x: 72, y: 48, w: 1136, h: 220, r: 0, z: 1 },
          style: { color: next.theme.ink, fontSize: 18 },
          content: {
            title: "In their words",
            items: [{ quote: "Replace this with a real quote you have permission to use.", name: "Name", role: "Role" }],
          },
        },
      ],
    });
  }
  if (id === "accent" && buttonsSafe(next)) {
    for (const sitePage of next.pages) {
      for (const section of sitePage.sections) {
        const button = section.elements.find((element) => element.type === "button");
        if (button) {
          button.style.background = next.theme.accent;
          button.style.color = "#ffffff";
          return next;
        }
      }
    }
  }
  if (id === "rhythm") {
    for (const sitePage of next.pages) {
      for (const section of sitePage.sections) {
        const sorted = [...section.elements].sort((a, b) => a.box.y - b.box.y);
        let y = 32;
        for (const element of sorted) {
          element.box.y = y;
          y += element.box.h + 20;
        }
        section.height = Math.max(section.height, y + 24);
      }
    }
  }
  return next;
}

function buttonsSafe(doc: WebsiteDocument) {
  return doc.pages.some((page) => page.sections.some((section) => section.elements.some((element) => element.type === "button")));
}
