import { defaultTheme, makeElement, uid } from "./document";
import type { ElementNode, SectionNode, ThemeDoc, WebsiteDocument } from "./types";

type Link = { label: string; href: string };
type Shot = { src: string; alt: string };

type Block =
  | { kind: "nav"; brand: string; links: string[] }
  | { kind: "hero"; eyebrow: string; title: string; body: string; cta: string; image?: string; dark?: boolean }
  | { kind: "story"; kicker: string; title: string; body: string }
  | { kind: "split"; title: string; body: string; image: string; flip?: boolean }
  | { kind: "cards"; title: string; items: { title: string; body: string }[] }
  | { kind: "gallery"; title: string; images: Shot[] }
  | { kind: "quotes"; title: string; items: { quote: string; name: string; role: string }[] }
  | { kind: "timeline"; title: string; items: { year: string; title: string; body: string }[] }
  | { kind: "countdown"; title: string; target: string; label: string }
  | { kind: "form"; title: string; body: string }
  | { kind: "quiz"; title: string; questions: { q: string; options: string[]; answer: number }[] }
  | { kind: "treasure"; title: string; clues: { text: string; answer: string }[] }
  | { kind: "surprise"; title: string; message: string }
  | { kind: "guestbook"; title: string }
  | { kind: "wheel"; title: string; segments: { label: string; color: string }[] }
  | { kind: "video"; title: string; youtubeId: string }
  | { kind: "social"; links: Link[] }
  | { kind: "cta"; title: string; body: string; label: string; href?: string }
  | { kind: "footer"; text: string };

function section(name: string, height: number, background: string, elements: ElementNode[]): SectionNode {
  return { id: uid(), name, locked: false, hidden: false, height, background, elements };
}

function blockToSection(block: Block, theme: ThemeDoc): SectionNode {
  if (block.kind === "nav") {
    return section("Navigation", 88, theme.ink, [
      makeElement("navbar", { x: 36, y: 18, w: 1208, h: 52 }, { brand: block.brand, links: block.links.map((label) => ({ label, href: "#top" })) }, { color: "#ffffff", fontSize: 15, fontWeight: 650 }, "Navbar"),
    ]);
  }
  if (block.kind === "hero") {
    const dark = block.dark !== false;
    const ink = dark ? "#f7f4ef" : theme.ink;
    const muted = dark ? "#d5cfc6" : theme.muted;
    const elements = [
      makeElement("text", { x: 72, y: 86, w: 420, h: 28 }, { text: block.eyebrow }, { color: theme.accent, fontSize: 13, fontWeight: 700, letterSpacing: 1.4 }, "Eyebrow"),
      makeElement("heading", { x: 72, y: 128, w: block.image ? 620 : 980, h: 180 }, { text: block.title }, { color: ink, fontSize: 68, fontWeight: 760, lineHeight: 0.92, fontFamily: "Syne" }, "Title"),
      makeElement("paragraph", { x: 72, y: 330, w: block.image ? 520 : 680, h: 110 }, { text: block.body }, { color: muted, fontSize: 18, lineHeight: 1.5 }, "Intro"),
      makeElement("button", { x: 72, y: 460, w: 210, h: 54 }, { label: block.cta, href: "#next", action: "link" }, { background: theme.accent, color: "#ffffff", radius: 999, fontWeight: 700, textAlign: "center", fontSize: 15 }, "Call to action"),
    ];
    if (block.image) {
      elements.push(makeElement("image", { x: 700, y: 78, w: 500, h: 500 }, { src: block.image, alt: block.title }, { radius: 28, objectFit: "cover" }, "Portrait"));
    }
    elements[1].motion = { preset: "fade", duration: 700, delay: 80, easing: "ease-out", trigger: "load", iterations: 1, infinite: false, keyframes: [] };
    return section("Hero", 660, dark ? "#141414" : theme.paper, elements);
  }
  if (block.kind === "story") {
    return section("Story", 460, theme.paper, [
      makeElement("text", { x: 72, y: 64, w: 320, h: 24 }, { text: block.kicker }, { color: theme.accent, fontSize: 13, fontWeight: 700, letterSpacing: 1.2 }, "Kicker"),
      makeElement("heading", { x: 72, y: 104, w: 760, h: 90 }, { text: block.title }, { color: theme.ink, fontSize: 42, fontWeight: 740, fontFamily: "Syne" }, "Heading"),
      makeElement("paragraph", { x: 72, y: 210, w: 760, h: 180 }, { text: block.body }, { color: theme.muted, fontSize: 18, lineHeight: 1.6 }, "Body"),
    ]);
  }
  if (block.kind === "split") {
    const image = makeElement("image", { x: block.flip ? 72 : 680, y: 48, w: 520, h: 420 }, { src: block.image, alt: block.title }, { radius: 24, objectFit: "cover" }, "Image");
    const title = makeElement("heading", { x: block.flip ? 640 : 72, y: 90, w: 500, h: 120 }, { text: block.title }, { color: theme.ink, fontSize: 40, fontWeight: 740, fontFamily: "Syne" }, "Heading");
    const body = makeElement("paragraph", { x: block.flip ? 640 : 72, y: 230, w: 480, h: 180 }, { text: block.body }, { color: theme.muted, fontSize: 17, lineHeight: 1.55 }, "Body");
    return section("Split", 520, theme.surface, [image, title, body]);
  }
  if (block.kind === "cards") {
    const elements: ElementNode[] = [makeElement("heading", { x: 72, y: 48, w: 700, h: 64 }, { text: block.title }, { color: theme.ink, fontSize: 36, fontWeight: 740, fontFamily: "Syne" }, "Heading")];
    block.items.slice(0, 3).forEach((item, index) => {
      const x = 72 + index * 380;
      elements.push(makeElement("card", { x, y: 140, w: 350, h: 230 }, { title: item.title, body: item.body }, { background: "#ffffff", color: theme.ink, radius: 20, padding: 22, shadow: "0 16px 30px rgba(18,18,18,0.06)" }, item.title));
    });
    return section("Cards", 430, "#efeae3", elements);
  }
  if (block.kind === "gallery") {
    return section("Gallery", 520, theme.paper, [
      makeElement("heading", { x: 72, y: 40, w: 640, h: 60 }, { text: block.title }, { color: theme.ink, fontSize: 36, fontWeight: 740, fontFamily: "Syne" }, "Heading"),
      makeElement("gallery", { x: 72, y: 120, w: 1136, h: 350 }, { title: block.title, images: block.images }, { radius: 18 }, "Gallery"),
    ]);
  }
  if (block.kind === "quotes") {
    return section("Voices", 380, theme.ink, [
      makeElement("testimonials", { x: 72, y: 48, w: 1136, h: 280 }, { title: block.title, items: block.items }, { color: "#f7f4ef", fontSize: 20 }, "Testimonials"),
    ]);
  }
  if (block.kind === "timeline") {
    return section("Timeline", 420, theme.surface, [
      makeElement("timeline", { x: 72, y: 40, w: 1136, h: 340 }, { title: block.title, items: block.items }, { color: theme.ink, fontSize: 16 }, "Timeline"),
    ]);
  }
  if (block.kind === "countdown") {
    return section("Countdown", 300, "#141414", [
      makeElement("countdown", { x: 72, y: 48, w: 1136, h: 200 }, { label: block.label, target: block.target, done: "The moment is here." }, { color: "#ffffff", fontSize: 28 }, "Countdown"),
      makeElement("heading", { x: 72, y: 36, w: 700, h: 20 }, { text: block.title }, { color: theme.accent, fontSize: 13, fontWeight: 700 }, "Label"),
    ]);
  }
  if (block.kind === "form") {
    return section("Form", 460, theme.surface, [
      makeElement("heading", { x: 72, y: 48, w: 520, h: 70 }, { text: block.title }, { color: theme.ink, fontSize: 36, fontWeight: 740, fontFamily: "Syne" }, "Heading"),
      makeElement("paragraph", { x: 72, y: 124, w: 460, h: 70 }, { text: block.body }, { color: theme.muted, fontSize: 16 }, "Note"),
      makeElement("form", { x: 620, y: 48, w: 560, h: 360 }, { title: block.title, submitLabel: "Send", success: "Received. The owner can read this in the dashboard.", fields: [{ id: "name", label: "Name", type: "text", required: true }, { id: "email", label: "Email", type: "email", required: true }, { id: "note", label: "Message", type: "textarea", required: true }] }, { background: "#ffffff", radius: 18, padding: 16 }, "Form"),
    ]);
  }
  if (block.kind === "quiz") return section("Quiz", 460, theme.paper, [makeElement("quiz", { x: 180, y: 40, w: 920, h: 380 }, { title: block.title, questions: block.questions }, { background: "#ffffff", radius: 20, padding: 20, color: theme.ink }, "Quiz")]);
  if (block.kind === "treasure") return section("Treasure", 420, "#1b1714", [makeElement("treasure", { x: 180, y: 40, w: 920, h: 340 }, { title: block.title, clues: block.clues }, { color: "#f6f3ee", background: "#241f1b", radius: 20, padding: 20 }, "Treasure hunt")]);
  if (block.kind === "surprise") return section("Surprise", 380, theme.paper, [makeElement("surprise", { x: 280, y: 40, w: 720, h: 300 }, { title: block.title, message: block.message, button: "Open" }, { background: "#ffffff", radius: 24, padding: 24, color: theme.ink }, "Surprise")]);
  if (block.kind === "guestbook") return section("Guestbook", 420, theme.surface, [makeElement("guestbook", { x: 160, y: 36, w: 960, h: 350 }, { title: block.title }, { background: "#ffffff", radius: 20, padding: 18, color: theme.ink }, "Guestbook")]);
  if (block.kind === "wheel") return section("Wheel", 460, "#141414", [makeElement("wheel", { x: 280, y: 30, w: 720, h: 400 }, { title: block.title, segments: block.segments }, { color: "#ffffff" }, "Wheel")]);
  if (block.kind === "video") return section("Film", 520, theme.ink, [makeElement("heading", { x: 72, y: 36, w: 640, h: 48 }, { text: block.title }, { color: "#ffffff", fontSize: 28, fontFamily: "Syne" }, "Heading"), makeElement("video", { x: 72, y: 100, w: 1136, h: 380 }, { youtubeId: block.youtubeId, title: block.title }, { radius: 16 }, "Video")]);
  if (block.kind === "social") return section("Social", 180, theme.paper, [makeElement("social", { x: 72, y: 48, w: 800, h: 80 }, { links: block.links.map((link) => ({ network: link.label, url: link.href, label: link.label, href: link.href })) }, { color: theme.ink, fontSize: 16 }, "Social")]);
  if (block.kind === "cta") {
    return section("Close", 320, theme.accent, [
      makeElement("heading", { x: 72, y: 64, w: 800, h: 90 }, { text: block.title }, { color: "#ffffff", fontSize: 42, fontWeight: 760, fontFamily: "Syne" }, "Heading"),
      makeElement("paragraph", { x: 72, y: 160, w: 640, h: 60 }, { text: block.body }, { color: "#fff4ee", fontSize: 18 }, "Body"),
      makeElement("button", { x: 72, y: 230, w: 200, h: 52 }, { label: block.label, href: block.href || "#", action: "link" }, { background: "#161616", color: "#ffffff", radius: 999, textAlign: "center", fontWeight: 700 }, "Button"),
    ]);
  }
  return section("Footer", 140, "#101010", [makeElement("footer", { x: 72, y: 40, w: 1136, h: 60 }, { text: block.text, links: [] }, { color: "#b9b3ab", fontSize: 13 }, "Footer")]);
}

export function compose(theme: Partial<ThemeDoc>, blocks: Block[], intro?: { title: string; subtitle: string }): WebsiteDocument {
  const full = { ...defaultTheme(), ...theme };
  return {
    version: 1,
    theme: full,
    pages: [{ id: uid(), name: "Home", slug: "home", background: full.paper, intro: intro ? { enabled: true, seconds: 4, ...intro } : undefined, sections: blocks.map((block) => blockToSection(block, full)) }],
    components: [],
    assets: [],
    ignoredAdvice: [],
    settings: { skipIntro: true, reducedMotion: false, lazyImages: true, lowEndFallback: true },
  };
}

const photos = {
  wedding: "/media/stock/wedding.png",
  table: "/media/stock/table.png",
  candles: "/media/stock/candles.png",
  restaurant: "/media/stock/restaurant.png",
  dining: "/media/stock/dining.png",
  concrete: "/media/stock/concrete.png",
  geometry: "/media/stock/geometry.png",
  birthday: "/media/stock/birthday.png",
  lanterns: "/media/stock/lanterns.png",
  lantern2: "/media/stock/lantern-2.png",
  cameras: "/media/stock/cameras.png",
};

export interface CatalogItem {
  slug: string;
  name: string;
  description: string;
  group: string;
  category: string;
  price: number;
  tier: "free" | "plus" | "pro";
  license: "use" | "remix";
  preview: string;
  images: string[];
  document: WebsiteDocument;
}

const footer = "Official BUILDEX catalog template. Replace the copy before you publish. Photography via Pexels.";

export const CATALOG: CatalogItem[] = [
  {
    slug: "love-letter",
    name: "Love Letter",
    description: "A quiet letter layout with a candlelit portrait, a timeline, and a sealed surprise.",
    group: "LOVE",
    category: "love-letter",
    price: 0,
    tier: "free",
    license: "use",
    preview: photos.candles,
    images: [photos.candles, photos.table],
    document: compose({ accent: "#ff4d1c", paper: "#f7f1ea", ink: "#1a1412" }, [
      { kind: "nav", brand: "For you", links: ["Letter", "Years", "Seal"] },
      { kind: "hero", eyebrow: "A letter, not a feed", title: "I kept the evening.", body: "Write the thing you would not put in a caption. This page is a private room with one door.", cta: "Read the letter", image: photos.candles },
      { kind: "story", kicker: "The letter", title: "You already know the first line.", body: "Replace this with your own words. Keep them specific: a street, a song, the hour. Specific is what makes a letter feel kept, not generated." },
      { kind: "timeline", title: "How we got here", items: [{ year: "01", title: "The meeting", body: "Name the place." }, { year: "02", title: "The habit", body: "Name the small thing you repeat." }, { year: "03", title: "This page", body: "The letter you can send as a link." }] },
      { kind: "surprise", title: "The seal", message: "Write the sentence that should stay hidden until they choose to open it." },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "anniversary-night",
    name: "Anniversary Night",
    description: "A dark dinner page with a countdown to the date and a guestbook.",
    group: "LOVE",
    category: "anniversary",
    price: 0,
    tier: "free",
    license: "use",
    preview: photos.table,
    images: [photos.table, photos.wedding],
    document: compose({ accent: "#e7b15a", paper: "#f4efe8", ink: "#1c140f" }, [
      { kind: "nav", brand: "Year two", links: ["Table", "Date", "Notes"] },
      { kind: "hero", eyebrow: "Anniversary", title: "Same table. Different year.", body: "Set the date, keep the photograph, and leave a line for the people who were there.", cta: "See the table", image: photos.table },
      { kind: "countdown", title: "Until the dinner", target: "2026-12-12T19:00:00", label: "The reservation" },
      { kind: "guestbook", title: "Leave a line on the table" },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "apology",
    name: "Apology",
    description: "A short, serious page. No jokes, no confetti — just the account and a reply form.",
    group: "LOVE",
    category: "apology",
    price: 0,
    tier: "free",
    license: "use",
    preview: photos.geometry,
    images: [photos.geometry],
    document: compose({ accent: "#c4552b", paper: "#f3f1ee", ink: "#1a1a1a" }, [
      { kind: "nav", brand: "A clear account", links: ["What happened", "Reply"] },
      { kind: "hero", eyebrow: "No decoration", title: "I owe you the plain version.", body: "Say what you did, what it cost, and what you will do next. Do not hide the sentence in an animation.", cta: "Read it", dark: true },
      { kind: "story", kicker: "The account", title: "What I did", body: "Replace this paragraph with the specific act. An apology that stays abstract is a performance." },
      { kind: "form", title: "If you want to answer", body: "The reply is stored for the site owner. It is not public." },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "birthday-glow",
    name: "Birthday Glow",
    description: "A warm birthday page with a countdown, gallery, and a wheel of small promises.",
    group: "OCCASIONS",
    category: "birthday",
    price: 0,
    tier: "plus",
    license: "use",
    preview: photos.birthday,
    images: [photos.birthday, photos.candles],
    document: compose({ accent: "#ff4d1c", paper: "#fff8f2" }, [
      { kind: "nav", brand: "For your year", links: ["Cake", "Wheel", "Wish"] },
      { kind: "hero", eyebrow: "Birthday", title: "Another lap around the sun.", body: "Put their name in the headline. Keep the cake photograph or replace it with one you took.", cta: "Make a wish", image: photos.birthday },
      { kind: "countdown", title: "Until midnight", target: "2026-08-20T00:00:00", label: "The day" },
      { kind: "wheel", title: "A wheel of small promises", segments: [{ label: "Breakfast", color: "#ff4d1c" }, { label: "A walk", color: "#1a1a1a" }, { label: "A letter", color: "#e7b15a" }, { label: "Silence", color: "#f4efe8" }] },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "wedding-table",
    name: "Wedding Table",
    description: "An invitation with schedule, gallery, and RSVP. Priced because the layout is complete.",
    group: "OCCASIONS",
    category: "wedding",
    price: 1800,
    tier: "plus",
    license: "use",
    preview: photos.wedding,
    images: [photos.wedding, photos.table, photos.candles],
    document: compose({ accent: "#9a3b2f", paper: "#f6f1ea", ink: "#241816" }, [
      { kind: "nav", brand: "Lina & Sami", links: ["Invitation", "Day", "RSVP"] },
      { kind: "hero", eyebrow: "You are invited", title: "Dinner, then dancing, then the long table.", body: "Replace the names, the date, and the photograph. The RSVP form stores replies for the couple.", cta: "See the day", image: photos.wedding },
      { kind: "cards", title: "The day", items: [{ title: "16:00", body: "Ceremony in the courtyard. Arrive early. The light is better." }, { title: "18:30", body: "Dinner. Your place card is a real one, not a QR code." }, { title: "21:00", body: "Music. Shoes optional after the second song." }] },
      { kind: "gallery", title: "The room", images: [{ src: photos.wedding, alt: "Wedding table" }, { src: photos.table, alt: "Place settings" }, { src: photos.candles, alt: "Candles" }] },
      { kind: "form", title: "RSVP", body: "Tell them if you are coming. Replies stay with the site owner." },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "ramadan-table",
    name: "Ramadan Table",
    description: "A lantern page for iftar times, a short reflection, and a guestbook.",
    group: "OCCASIONS",
    category: "ramadan",
    price: 0,
    tier: "free",
    license: "use",
    preview: photos.lanterns,
    images: [photos.lanterns, photos.lantern2],
    document: compose({ accent: "#e0a24a", paper: "#f8f1e4", ink: "#1b140c" }, [
      { kind: "nav", brand: "Ramadan", links: ["Iftar", "Note", "Guests"] },
      { kind: "hero", eyebrow: "شهر كريم", title: "The table is set before the light goes.", body: "Put your city's iftar time in the countdown. Keep the language as formal or as familiar as your house is.", cta: "Read the note", image: photos.lanterns },
      { kind: "countdown", title: "Until iftar", target: "2026-03-01T18:12:00", label: "Maghrib" },
      { kind: "story", kicker: "A note", title: "Leave the day quieter than you found it.", body: "Write a short reflection in your own voice. This template does not invent a sermon for you." },
      { kind: "guestbook", title: "Who is at the table" },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "eid-morning",
    name: "Eid Morning",
    description: "A bright greeting page with a gallery and a message that stays closed until opened.",
    group: "OCCASIONS",
    category: "eid",
    price: 0,
    tier: "free",
    license: "use",
    preview: photos.lantern2,
    images: [photos.lantern2, photos.lanterns],
    document: compose({ accent: "#0f6b4c", paper: "#f4f7f2", ink: "#14211b" }, [
      { kind: "nav", brand: "Eid", links: ["Greeting", "Photos", "Note"] },
      { kind: "hero", eyebrow: "عيد مبارك", title: "Morning, finally.", body: "A greeting with room for the people you actually called, not a generic card.", cta: "Open the note", image: photos.lantern2, dark: false },
      { kind: "gallery", title: "From the morning", images: [{ src: photos.lantern2, alt: "Lantern" }, { src: photos.lanterns, alt: "Lanterns" }] },
      { kind: "surprise", title: "For the group", message: "Write the joke only your people will understand." },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "graduation-mark",
    name: "Graduation Mark",
    description: "A clean milestone page with a timeline and a public congratulations book.",
    group: "OCCASIONS",
    category: "graduation",
    price: 0,
    tier: "free",
    license: "remix",
    preview: photos.concrete,
    images: [photos.concrete, photos.geometry],
    document: compose({ accent: "#ff4d1c", paper: "#f5f4f1", ink: "#161616" }, [
      { kind: "nav", brand: "Class mark", links: ["Name", "Years", "Notes"] },
      { kind: "hero", eyebrow: "Graduation", title: "The work had a date on it.", body: "Put the name, the field, and the year. Skip the stock applause.", cta: "See the years", image: photos.concrete },
      { kind: "timeline", title: "The long way", items: [{ year: "Year 1", title: "The start", body: "What was hard." }, { year: "Year 3", title: "The turn", body: "What changed." }, { year: "Now", title: "The mark", body: "What comes next." }] },
      { kind: "guestbook", title: "Congratulations, specifically" },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "best-friend",
    name: "Best Friend",
    description: "A blunt friendship page: memories, a challenge, and a secret line.",
    group: "FRIENDS",
    category: "best-friend",
    price: 0,
    tier: "free",
    license: "use",
    preview: photos.cameras,
    images: [photos.cameras],
    document: compose({ accent: "#ff4d1c", paper: "#f7f4ef" }, [
      { kind: "nav", brand: "You, specifically", links: ["Memory", "Challenge", "Secret"] },
      { kind: "hero", eyebrow: "Friends", title: "I still have the bad photo.", body: "Friendship pages fail when they sound like ads. Use the embarrassing detail.", cta: "Open it", image: photos.cameras },
      { kind: "cards", title: "Three memories", items: [{ title: "The road", body: "Name the trip." }, { title: "The argument", body: "Name what you were wrong about." }, { title: "The ordinary Tuesday", body: "Name the ritual." }] },
      { kind: "surprise", title: "Secret", message: "The line you would not post." },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "farewell",
    name: "Farewell",
    description: "A leaving page with a timeline and a guestbook for the team or the house.",
    group: "FRIENDS",
    category: "farewell",
    price: 0,
    tier: "free",
    license: "use",
    preview: photos.geometry,
    images: [photos.geometry, photos.concrete],
    document: compose({ accent: "#355c7d", paper: "#f3f4f6", ink: "#1c2430" }, [
      { kind: "nav", brand: "Leaving well", links: ["Note", "Years", "Messages"] },
      { kind: "hero", eyebrow: "Farewell", title: "I am going, and I am taking the good part.", body: "Write who you are leaving and what you want them to keep. No countdown required.", cta: "Read the note", dark: true },
      { kind: "timeline", title: "What we made", items: [{ year: "Start", title: "Arrival", body: "How it began." }, { year: "Middle", title: "The work", body: "What held." }, { year: "Now", title: "The door", body: "How to stay in touch." }] },
      { kind: "guestbook", title: "Say it here" },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "quiz-night",
    name: "Quiz Night",
    description: "A hosted quiz with scored questions. Included with Plus because it is a game.",
    group: "INTERACTIVE",
    category: "quiz",
    price: 0,
    tier: "plus",
    license: "remix",
    preview: photos.dining,
    images: [photos.dining],
    document: compose({ accent: "#ff4d1c", paper: "#f6f3ee" }, [
      { kind: "nav", brand: "Quiz night", links: ["Rules", "Questions"] },
      { kind: "hero", eyebrow: "Interactive", title: "Six questions. No lifelines.", body: "Replace the questions with ones only your people can answer. The score is calculated in the page, not invented.", cta: "Start", dark: true },
      { kind: "quiz", title: "Round one", questions: [{ q: "Where did we first argue about music?", options: ["A kitchen", "A car", "A roof", "A library"], answer: 1 }, { q: "What time does the good bakery close?", options: ["14:00", "16:00", "18:00", "It never opens"], answer: 2 }, { q: "Who always arrives last?", options: ["You", "Me", "Both", "The bus"], answer: 0 }] },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "treasure-hunt",
    name: "Treasure Hunt",
    description: "A three-clue hunt. Answers are checked on the page. Paid because the structure is ready to customize.",
    group: "INTERACTIVE",
    category: "treasure-hunt",
    price: 900,
    tier: "plus",
    license: "use",
    preview: photos.concrete,
    images: [photos.concrete],
    document: compose({ accent: "#e7b15a", paper: "#f4efe6", ink: "#1b1714" }, [
      { kind: "nav", brand: "The hunt", links: ["Clues"] },
      { kind: "hero", eyebrow: "Treasure", title: "The prize is in the third answer.", body: "Change the clues and the answers. Matching is exact after trimming spaces, and it stays on the device.", cta: "Begin", dark: true },
      { kind: "treasure", title: "Three clues", clues: [{ text: "The room with the worst chair. What color is the mug?", answer: "blue" }, { text: "The note is under the thing you always lose. Name it.", answer: "keys" }, { text: "Last one. The year on the ticket stub.", answer: "2019" }] },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "atelier-portfolio",
    name: "Atelier Portfolio",
    description: "A photographer or studio portfolio with selected work, a services row, and a contact form.",
    group: "PERSONAL",
    category: "portfolio",
    price: 0,
    tier: "free",
    license: "remix",
    preview: photos.cameras,
    images: [photos.cameras, photos.concrete, photos.geometry],
    document: compose({ accent: "#ff4d1c", paper: "#f3f1ec", ink: "#141414" }, [
      { kind: "nav", brand: "Atelier", links: ["Work", "Services", "Contact"] },
      { kind: "hero", eyebrow: "Portfolio", title: "Work with a point of view.", body: "Replace the name, the cities, and the frames. This is a catalog starting point, not a fake client list.", cta: "View work", image: photos.cameras },
      { kind: "gallery", title: "Selected frames", images: [{ src: photos.cameras, alt: "Cameras on a desk" }, { src: photos.concrete, alt: "Concrete light" }, { src: photos.geometry, alt: "Geometric wall" }] },
      { kind: "cards", title: "How the work is sold", items: [{ title: "Portrait", body: "Half day. One location. Delivered as a private link." }, { title: "Space", body: "Architecture and interiors. No people unless asked." }, { title: "Print", body: "A short edition, numbered, not a filter pack." }] },
      { kind: "form", title: "Commission", body: "Tell the studio what the pictures are for." },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "developer-profile",
    name: "Developer Profile",
    description: "A sharp personal site: selected work, a timeline, and links. No fake metrics.",
    group: "PERSONAL",
    category: "developer",
    price: 0,
    tier: "free",
    license: "remix",
    preview: photos.geometry,
    images: [photos.geometry, photos.concrete],
    document: compose({ accent: "#ff4d1c", paper: "#f6f5f2", ink: "#121212" }, [
      { kind: "nav", brand: "Profile", links: ["Work", "Path", "Links"] },
      { kind: "hero", eyebrow: "Developer", title: "I build things people can finish.", body: "Put real projects here. If a metric is not yours, leave it out.", cta: "Selected work", dark: true },
      { kind: "cards", title: "Selected work", items: [{ title: "Project one", body: "What it does, who it is for, what you owned." }, { title: "Project two", body: "The constraint that shaped it." }, { title: "Project three", body: "What you would redo." }] },
      { kind: "timeline", title: "Path", items: [{ year: "Then", title: "First ship", body: "The small thing that worked." }, { year: "Later", title: "The hard system", body: "What you learned about limits." }, { year: "Now", title: "Open", body: "What you want next." }] },
      { kind: "social", links: [{ label: "Email", href: "mailto:hello@example.com" }, { label: "Work", href: "https://example.com" }] },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "northline-company",
    name: "Northline Company",
    description: "A company site with services, proof, and a contact form. Free, and honest about placeholders.",
    group: "BUSINESS",
    category: "company",
    price: 0,
    tier: "free",
    license: "use",
    preview: photos.concrete,
    images: [photos.concrete, photos.geometry],
    document: compose({ accent: "#ff4d1c", paper: "#f4f2ee", ink: "#161616" }, [
      { kind: "nav", brand: "Northline", links: ["Practice", "Work", "Contact"] },
      { kind: "hero", eyebrow: "Company", title: "Spaces with a measurable calm.", body: "A starting company site. Replace Northline with your practice. Do not publish the sample quote as if a client said it.", cta: "The practice", image: photos.concrete },
      { kind: "cards", title: "The practice", items: [{ title: "Interiors", body: "Rooms people stay in." }, { title: "Objects", body: "A short run of furniture." }, { title: "Advice", body: "A paid review, not a free audit." }] },
      { kind: "quotes", title: "Replace this quote", items: [{ quote: "Sample sentence. Replace it with a quote you have permission to publish.", name: "Client name", role: "City" }] },
      { kind: "form", title: "Start a project", body: "Tell us the site, the date, and the constraint." },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "hearth-restaurant",
    name: "Hearth Restaurant",
    description: "A restaurant page with hours, a film, and a reservation form. Pro tier for the fuller layout.",
    group: "BUSINESS",
    category: "restaurant",
    price: 2400,
    tier: "pro",
    license: "use",
    preview: photos.restaurant,
    images: [photos.restaurant, photos.dining],
    document: compose({ accent: "#c2410c", paper: "#f8f3ec", ink: "#1c1410" }, [
      { kind: "nav", brand: "Hearth", links: ["Table", "Hours", "Reserve"] },
      { kind: "hero", eyebrow: "Restaurant", title: "Fire, bread, a short menu.", body: "Put your real hours and your real address. The film is a placeholder you should replace with your own YouTube link.", cta: "Reserve", image: photos.dining },
      { kind: "cards", title: "Service", items: [{ title: "Lunch", body: "12:00–15:00. Walk-ins if the pass is clear." }, { title: "Dinner", body: "18:00–22:30. Book the window if you want it." }, { title: "Sunday", body: "Closed. The oven rests." }] },
      { kind: "video", title: "Replace this film", youtubeId: "aqz-KE-bpKQ" },
      { kind: "form", title: "Reservation", body: "This stores a request. It does not confirm a table by itself." },
      { kind: "footer", text: footer },
    ], { title: "Hearth", subtitle: "A short opening. Skip it if you are in a hurry." }),
  },
  {
    slug: "product-showcase",
    name: "Product Showcase",
    description: "A product page with three claims, a gallery, and a waitlist form.",
    group: "BUSINESS",
    category: "product",
    price: 1900,
    tier: "pro",
    license: "use",
    preview: photos.geometry,
    images: [photos.geometry, photos.concrete],
    document: compose({ accent: "#ff4d1c", paper: "#f5f5f4", ink: "#111111" }, [
      { kind: "nav", brand: "Object", links: ["Product", "Details", "Waitlist"] },
      { kind: "hero", eyebrow: "Product", title: "One object. Three reasons.", body: "Name the product. If you do not have reviews yet, delete the quote section instead of inventing them.", cta: "Join the list", image: photos.geometry },
      { kind: "cards", title: "Why it exists", items: [{ title: "Material", body: "Say what it is made of." }, { title: "Use", body: "Say what it replaces." }, { title: "Limit", body: "Say what it will not do." }] },
      { kind: "gallery", title: "Details", images: [{ src: photos.geometry, alt: "Detail" }, { src: photos.concrete, alt: "Material" }] },
      { kind: "form", title: "Waitlist", body: "We store the request. We do not sell the address onward from this form." },
      { kind: "footer", text: footer },
    ]),
  },
  {
    slug: "landing-pulse",
    name: "Landing Pulse",
    description: "A direct landing page: claim, three points, one form. Free and remixable.",
    group: "BUSINESS",
    category: "landing",
    price: 0,
    tier: "free",
    license: "remix",
    preview: photos.concrete,
    images: [photos.concrete],
    document: compose({ accent: "#ff4d1c", paper: "#f7f6f3", ink: "#141414" }, [
      { kind: "nav", brand: "Offer", links: ["Claim", "Proof", "Start"] },
      { kind: "hero", eyebrow: "Landing", title: "Say the offer in one line.", body: "If the sentence needs a subtitle to make sense, the sentence is not finished.", cta: "Start", dark: true },
      { kind: "cards", title: "Three points", items: [{ title: "Who", body: "The person this is for." }, { title: "What", body: "The thing they get." }, { title: "When", body: "How soon it starts." }] },
      { kind: "cta", title: "Ask for the next step.", body: "One action. The form sits below if you need a name.", label: "Continue" },
      { kind: "form", title: "Request", body: "Stored for the site owner." },
      { kind: "footer", text: footer },
    ]),
  },
];

export const CATEGORY_SEEDS = [
  ["love-letter", "LOVE", "Love Letter"],
  ["anniversary", "LOVE", "Anniversary"],
  ["first-meeting", "LOVE", "First Meeting"],
  ["apology", "LOVE", "Apology"],
  ["love-story", "LOVE", "Love Story"],
  ["proposal", "LOVE", "Proposal"],
  ["photo-memories", "LOVE", "Photo Memories"],
  ["birthday", "OCCASIONS", "Birthday"],
  ["wedding", "OCCASIONS", "Wedding"],
  ["engagement", "OCCASIONS", "Engagement"],
  ["graduation", "OCCASIONS", "Graduation"],
  ["success", "OCCASIONS", "Success"],
  ["invitations", "OCCASIONS", "Invitations"],
  ["ramadan", "OCCASIONS", "Ramadan"],
  ["eid", "OCCASIONS", "Eid"],
  ["new-year", "OCCASIONS", "New Year"],
  ["best-friend", "FRIENDS", "Best Friend"],
  ["memories", "FRIENDS", "Memories"],
  ["challenges", "FRIENDS", "Challenges"],
  ["secret-messages", "FRIENDS", "Secret Messages"],
  ["farewell", "FRIENDS", "Farewell"],
  ["quiz", "INTERACTIVE", "Quiz"],
  ["treasure-hunt", "INTERACTIVE", "Treasure Hunt"],
  ["surprise-box", "INTERACTIVE", "Surprise Box"],
  ["countdown-reveal", "INTERACTIVE", "Countdown Reveal"],
  ["puzzle", "INTERACTIVE", "Puzzle"],
  ["wheel", "INTERACTIVE", "Wheel of Fortune"],
  ["mini-games", "INTERACTIVE", "Mini Games"],
  ["portfolio", "PERSONAL", "Portfolio"],
  ["profile", "PERSONAL", "Profile"],
  ["cv", "PERSONAL", "CV"],
  ["social-links", "PERSONAL", "Social Links"],
  ["photographer", "PERSONAL", "Photographer"],
  ["developer", "PERSONAL", "Developer"],
  ["company", "BUSINESS", "Company Website"],
  ["landing", "BUSINESS", "Landing Page"],
  ["services", "BUSINESS", "Services"],
  ["restaurant", "BUSINESS", "Restaurant"],
  ["product", "BUSINESS", "Product Showcase"],
  ["blog", "BUSINESS", "Blog"],
] as const;
