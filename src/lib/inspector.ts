import { CANVAS, resolveBox, sectionHeight } from "./document";
import type { ElementNode, SectionNode, WebsiteDocument } from "./types";

export interface QualityIssue {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  where: string;
  cause: string;
  remedy: string;
  auto: boolean;
}

function hex(color?: string) {
  if (!color || !color.startsWith("#")) return null;
  const raw = color.slice(1);
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n) || full.length < 6) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

function luminance(color?: string) {
  const rgb = hex(color);
  if (!rgb) return null;
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a?: string, b?: string) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function intersects(a: ElementNode, b: ElementNode) {
  const ax2 = a.box.x + a.box.w;
  const ay2 = a.box.y + a.box.h;
  const bx2 = b.box.x + b.box.w;
  const by2 = b.box.y + b.box.h;
  const w = Math.max(0, Math.min(ax2, bx2) - Math.max(a.box.x, b.box.x));
  const h = Math.max(0, Math.min(ay2, by2) - Math.max(a.box.y, b.box.y));
  const area = w * h;
  const minArea = Math.min(a.box.w * a.box.h, b.box.w * b.box.h);
  return minArea > 0 && area / minArea > 0.45;
}

function locate(pageName: string, section: SectionNode, element?: ElementNode) {
  return element ? `${pageName} / ${section.name} / ${element.name}` : `${pageName} / ${section.name}`;
}

export function inspectDocument(doc: WebsiteDocument): QualityIssue[] {
  const issues: QualityIssue[] = [];
  let motions = 0;
  let images = 0;
  for (const page of doc.pages) {
    const hasNav = page.sections.some((section) => section.elements.some((element) => element.type === "navbar"));
    if (!hasNav && page.sections.length > 1) {
      issues.push({
        id: `nav:${page.id}`,
        severity: "low",
        title: "No navigation",
        where: page.name,
        cause: "Visitors cannot see a clear path between sections or pages.",
        remedy: "Add a navbar section at the top.",
        auto: true,
      });
    }
    for (const section of page.sections) {
      const visible = section.elements.filter((element) => !element.hidden);
      if (!section.hidden && visible.length === 0) {
        issues.push({
          id: `empty:${section.id}`,
          severity: "medium",
          title: "Empty section",
          where: locate(page.name, section),
          cause: "The section has no visible elements.",
          remedy: "Remove the empty section.",
          auto: true,
        });
      }
      for (let i = 0; i < visible.length; i += 1) {
        for (let j = i + 1; j < visible.length; j += 1) {
          const a = visible[i];
          const b = visible[j];
          if (a.type === "container" || b.type === "container" || a.type === "shape" || b.type === "shape") continue;
          if (intersects(a, b)) {
            issues.push({
              id: `overlap:${a.id}:${b.id}`,
              severity: "high",
              title: "Overlapping elements",
              where: locate(page.name, section, a),
              cause: `${a.name} covers a large part of ${b.name}.`,
              remedy: "Move the upper element below the other.",
              auto: true,
            });
          }
        }
      }
      for (const element of visible) {
        const box = element.box;
        if (box.x < -4 || box.y < -4 || box.x + box.w > CANVAS.desktop + 8 || box.y + box.h > section.height + 8) {
          issues.push({
            id: `outside:${element.id}`,
            severity: "high",
            title: "Element outside the canvas",
            where: locate(page.name, section, element),
            cause: "Part of the element sits outside the desktop frame.",
            remedy: "Pull the element back inside the section.",
            auto: true,
          });
        }
        const mobile = resolveBox(element, "mobile");
        const mobileHeight = sectionHeight(section, "mobile");
        if (mobile.x < -4 || mobile.x + mobile.w > CANVAS.mobile + 12 || mobile.y + mobile.h > mobileHeight + 16) {
          issues.push({
            id: `responsive:${element.id}`,
            severity: "medium",
            title: "Mobile overflow",
            where: locate(page.name, section, element),
            cause: "The mobile layout extends past the phone frame.",
            remedy: "Fit a dedicated mobile box to the 390px frame.",
            auto: true,
          });
        }
        if (["heading", "text", "paragraph"].includes(element.type)) {
          const text = String(element.content.text || "");
          const size = element.style.fontSize || 16;
          const estimated = text.length * size * 0.5;
          if (text && estimated > box.w * box.h) {
            issues.push({
              id: `clip:${element.id}`,
              severity: "medium",
              title: "Text may be clipped",
              where: locate(page.name, section, element),
              cause: "The text is longer than the box can comfortably hold.",
              remedy: "Increase the box height.",
              auto: true,
            });
          }
          const bg = element.style.background && element.style.background !== "transparent" ? element.style.background : section.background;
          const ratio = contrast(element.style.color, bg);
          if (ratio !== null && ratio < 4.5) {
            issues.push({
              id: `contrast:${element.id}`,
              severity: "high",
              title: "Low contrast",
              where: locate(page.name, section, element),
              cause: `Contrast ratio is ${ratio.toFixed(2)}, below 4.5.`,
              remedy: "Switch the text to a higher-contrast color.",
              auto: true,
            });
          }
        }
        if (element.type === "image") {
          images += 1;
          if (!element.content.src) {
            issues.push({
              id: `image:${element.id}`,
              severity: "high",
              title: "Missing image",
              where: locate(page.name, section, element),
              cause: "The image element has no source.",
              remedy: "Remove the empty image so the page does not show a broken frame.",
              auto: true,
            });
          } else if (!element.content.alt) {
            issues.push({
              id: `alt:${element.id}`,
              severity: "medium",
              title: "Image missing alt text",
              where: locate(page.name, section, element),
              cause: "Screen readers cannot describe this image.",
              remedy: "Use the element name as alt text.",
              auto: true,
            });
          }
        }
        if (element.type === "button") {
          const href = String(element.content.href || "");
          if (!element.content.label) {
            issues.push({
              id: `button-label:${element.id}`,
              severity: "high",
              title: "Button without a label",
              where: locate(page.name, section, element),
              cause: "The control has no accessible name.",
              remedy: "Set the label to Continue.",
              auto: true,
            });
          }
          if (element.content.action !== "none" && (!href || href.startsWith("javascript:"))) {
            issues.push({
              id: `link:${element.id}`,
              severity: "medium",
              title: "Broken link",
              where: locate(page.name, section, element),
              cause: "The button does not point to a valid URL or page.",
              remedy: "Point the button at the home page.",
              auto: true,
            });
          }
        }
        if (element.motion && element.motion.preset !== "none") motions += 1;
      }
    }
  }
  if (motions > 10) {
    issues.push({
      id: "perf:motion",
      severity: "medium",
      title: "Heavy motion",
      where: "Site",
      cause: `${motions} animated elements will cost frames on low-end phones.`,
      remedy: "Keep the first eight motions and disable the rest.",
      auto: true,
    });
  }
  if (images > 16) {
    issues.push({
      id: "perf:images",
      severity: "low",
      title: "Many images",
      where: "Site",
      cause: "Large galleries slow the first paint.",
      remedy: "Turn on lazy images in site settings.",
      auto: true,
    });
  }
  return issues;
}

export function applyIssueFix(doc: WebsiteDocument, issueId: string): WebsiteDocument {
  const next = structuredClone(doc);
  const issue = inspectDocument(next).find((item) => item.id === issueId);
  if (!issue || !issue.auto) return next;
  if (issueId.startsWith("empty:")) {
    const id = issueId.slice(6);
    for (const page of next.pages) page.sections = page.sections.filter((section) => section.id !== id);
  }
  if (issueId.startsWith("overlap:")) {
    const [, aId, bId] = issueId.split(":");
    for (const page of next.pages) {
      for (const section of page.sections) {
        const a = section.elements.find((element) => element.id === aId);
        const b = section.elements.find((element) => element.id === bId);
        if (a && b) a.box.y = b.box.y + b.box.h + 16;
      }
    }
  }
  if (issueId.startsWith("outside:")) {
    const id = issueId.slice(8);
    for (const page of next.pages) {
      for (const section of page.sections) {
        const element = section.elements.find((item) => item.id === id);
        if (!element) continue;
        element.box.x = Math.max(0, Math.min(element.box.x, CANVAS.desktop - element.box.w));
        element.box.y = Math.max(0, Math.min(element.box.y, section.height - Math.min(element.box.h, section.height)));
        if (element.box.h > section.height) section.height = element.box.y + element.box.h + 24;
      }
    }
  }
  if (issueId.startsWith("responsive:")) {
    const id = issueId.slice(11);
    let y = 16;
    for (const page of next.pages) {
      for (const section of page.sections) {
        const element = section.elements.find((item) => item.id === id);
        if (!element) continue;
        element.mobile = { x: 16, y, w: CANVAS.mobile - 32, h: Math.max(48, Math.min(element.box.h, 280)), r: 0, z: element.box.z };
        section.mobileHeight = Math.max(section.mobileHeight || 0, y + (element.mobile.h || 80) + 24);
        y += (element.mobile.h || 80) + 12;
      }
    }
  }
  if (issueId.startsWith("clip:")) {
    const id = issueId.slice(5);
    for (const page of next.pages) {
      for (const section of page.sections) {
        const element = section.elements.find((item) => item.id === id);
        if (!element) continue;
        element.box.h = Math.min(800, element.box.h + 80);
        section.height = Math.max(section.height, element.box.y + element.box.h + 24);
      }
    }
  }
  if (issueId.startsWith("contrast:")) {
    const id = issueId.slice(9);
    for (const page of next.pages) {
      for (const section of page.sections) {
        const element = section.elements.find((item) => item.id === id);
        if (!element) continue;
        const bg = element.style.background && element.style.background !== "transparent" ? element.style.background : section.background;
        const lum = luminance(bg) ?? 1;
        element.style.color = lum > 0.4 ? "#161616" : "#ffffff";
      }
    }
  }
  if (issueId.startsWith("image:")) {
    const id = issueId.slice(6);
    for (const page of next.pages) for (const section of page.sections) section.elements = section.elements.filter((element) => element.id !== id);
  }
  if (issueId.startsWith("alt:")) {
    const id = issueId.slice(4);
    for (const page of next.pages) {
      for (const section of page.sections) {
        const element = section.elements.find((item) => item.id === id);
        if (element) element.content.alt = element.name || "Image";
      }
    }
  }
  if (issueId.startsWith("button-label:")) {
    const id = issueId.slice(13);
    for (const page of next.pages) {
      for (const section of page.sections) {
        const element = section.elements.find((item) => item.id === id);
        if (element) element.content.label = "Continue";
      }
    }
  }
  if (issueId.startsWith("link:")) {
    const id = issueId.slice(5);
    for (const page of next.pages) {
      for (const section of page.sections) {
        const element = section.elements.find((item) => item.id === id);
        if (element) {
          element.content.href = "/";
          element.content.action = "link";
        }
      }
    }
  }
  if (issueId.startsWith("nav:")) {
    const page = next.pages.find((item) => issueId.endsWith(item.id));
    if (page) {
      page.sections.unshift({
        id: crypto.randomUUID(),
        name: "Navigation",
        locked: false,
        hidden: false,
        height: 84,
        background: "#141414",
        elements: [
          {
            id: crypto.randomUUID(),
            type: "navbar",
            name: "Navbar",
            locked: false,
            hidden: false,
            box: { x: 24, y: 16, w: 1232, h: 52, r: 0, z: 5 },
            style: { color: "#ffffff", fontSize: 15, fontWeight: 650 },
            content: { brand: "Site", links: page.sections.slice(0, 4).map((section) => ({ label: section.name, href: `#${section.id}` })) },
          },
        ],
      });
    }
  }
  if (issueId === "perf:motion") {
    let kept = 0;
    for (const page of next.pages) {
      for (const section of page.sections) {
        for (const element of section.elements) {
          if (!element.motion || element.motion.preset === "none") continue;
          kept += 1;
          if (kept > 8) element.motion.preset = "none";
        }
      }
    }
  }
  if (issueId === "perf:images") next.settings.lazyImages = true;
  return next;
}
