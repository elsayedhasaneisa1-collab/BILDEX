"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CANVAS, resolveBox, resolveStyle, sectionHeight, youtubeId } from "@/lib/document";
import type { ElementNode, ElementStyle, PageDoc, WebsiteDocument } from "@/lib/types";

type Mode = "edit" | "preview" | "live";

export function SiteCanvas({
  doc,
  page,
  breakpoint,
  mode,
  scale = 1,
  websiteId,
  siteSlug,
  selectedIds = [],
  onSelect,
  onPointerDown,
  onResizeStart,
}: {
  doc: WebsiteDocument;
  page: PageDoc;
  breakpoint: "desktop" | "tablet" | "mobile";
  mode: Mode;
  scale?: number;
  websiteId?: string;
  siteSlug?: string;
  selectedIds?: string[];
  onSelect?: (id: string, additive: boolean) => void;
  onPointerDown?: (id: string, event: React.PointerEvent) => void;
  onResizeStart?: (id: string, direction: "nw" | "ne" | "sw" | "se", event: React.PointerEvent) => void;
}) {
  const width = CANVAS[breakpoint];
  const reduced = usePrefersReduced(doc.settings.reducedMotion);
  const [intro, setIntro] = useState(Boolean(page.intro?.enabled) && mode !== "edit");
  useEffect(() => {
    if (!intro) return;
    const timer = setTimeout(() => setIntro(false), (page.intro?.seconds || 4) * 1000);
    return () => clearTimeout(timer);
  }, [intro, page.intro?.seconds]);
  return (
    <div style={{ width: width * scale, margin: "0 auto" }}>
      {intro && (
        <div style={{ position: "relative", minHeight: 320, display: "grid", placeItems: "center", background: "#111", color: "white", borderRadius: 18, marginBottom: 12 }}>
          <div style={{ textAlign: "center", padding: 24 }}>
            <div className="kicker">Opening</div>
            <h2 className="display" style={{ fontSize: 48, margin: "8px 0" }}>{page.intro?.title}</h2>
            <p>{page.intro?.subtitle}</p>
            {doc.settings.skipIntro !== false && <button className="btn orange" type="button" onClick={() => setIntro(false)}>Skip intro</button>}
          </div>
        </div>
      )}
      {page.sections.filter((section) => mode === "edit" || !section.hidden).map((section) => {
        const height = sectionHeight(section, breakpoint);
        return (
          <section key={section.id} style={{ height: height * scale, position: "relative", background: page.background }}>
            <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative", background: section.background }}>
              {section.elements.filter((element) => mode === "edit" || !element.hidden).map((element) => (
                <ElementView
                  key={element.id}
                  element={element}
                  breakpoint={breakpoint}
                  mode={mode}
                  reduced={reduced}
                  selected={selectedIds.includes(element.id)}
                  websiteId={websiteId}
                  siteSlug={siteSlug}
                  lazy={doc.settings.lazyImages}
                  onSelect={onSelect}
                  onPointerDown={onPointerDown}
                  onResizeStart={onResizeStart}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ElementView({
  element,
  breakpoint,
  mode,
  reduced,
  selected,
  websiteId,
  siteSlug,
  lazy,
  onSelect,
  onPointerDown,
  onResizeStart,
}: {
  element: ElementNode;
  breakpoint: "desktop" | "tablet" | "mobile";
  mode: Mode;
  reduced: boolean;
  selected: boolean;
  websiteId?: string;
  siteSlug?: string;
  lazy: boolean;
  onSelect?: (id: string, additive: boolean) => void;
  onPointerDown?: (id: string, event: React.PointerEvent) => void;
  onResizeStart?: (id: string, direction: "nw" | "ne" | "sw" | "se", event: React.PointerEvent) => void;
}) {
  const box = resolveBox(element, breakpoint);
  const style = resolveStyle(element, breakpoint);
  const motion = element.motion;
  const allowMotion = !reduced && motion && motion.preset !== "none" && mode !== "edit";
  const elementRef = useRef<HTMLDivElement>(null);
  const className = allowMotion && motion && motion.preset !== "parallax" && motion.preset !== "typewriter" && !motion.keyframes?.length ? `mx mx-${motion.preset === "particles" ? "fade" : motion.preset}` : "";
  useEffect(() => {
    const node = elementRef.current;
    if (!node || !allowMotion || !motion) return;
    if (motion.keyframes?.length && typeof node.animate === "function") {
      const frames = [...motion.keyframes].sort((a, b) => a.t - b.t).map((frame) => ({
        offset: Math.max(0, Math.min(100, frame.t)) / 100,
        opacity: frame.opacity,
        transform: `perspective(900px) translate(${frame.x || 0}px, ${frame.y || 0}px) scale(${frame.scale ?? 1}) rotate(${box.r + (frame.rotate || 0)}deg) rotateX(${frame.rotateX || 0}deg) rotateY(${frame.rotateY || 0}deg)`,
      }));
      const animation = node.animate(frames, {
        duration: Math.max(100, motion.duration || 700),
        delay: Math.max(0, motion.delay || 0),
        easing: motion.easing || "ease-out",
        iterations: motion.infinite ? Infinity : Math.max(1, motion.iterations || 1),
        fill: "both",
      });
      return () => animation.cancel();
    }
    if (motion.preset === "parallax") {
      let raf = 0;
      const update = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const rect = node.getBoundingClientRect();
          const factor = Math.max(-1, Math.min(1, Number(motion.parallax ?? 0.2)));
          const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * factor * -0.12;
          node.style.translate = `0 ${offset.toFixed(1)}px`;
        });
      };
      window.addEventListener("scroll", update, { passive: true });
      update();
      return () => {
        window.removeEventListener("scroll", update);
        cancelAnimationFrame(raf);
        node.style.translate = "";
      };
    }
  }, [allowMotion, motion, box.r]);
  return (
    <div
      ref={elementRef}
      data-id={element.id}
      className={className}
      onPointerDown={(event) => {
        if (mode !== "edit") return;
        event.stopPropagation();
        onSelect?.(element.id, event.shiftKey);
        if (!element.locked) onPointerDown?.(element.id, event);
      }}
      onClick={(event) => {
        if (mode === "edit") event.preventDefault();
      }}
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        transform: `rotate(${box.r}deg)`,
        zIndex: box.z,
        opacity: element.hidden && mode === "edit" ? 0.35 : style.opacity ?? 1,
        outline: selected ? "2px solid #ff4d1c" : mode === "edit" ? "1px dashed rgba(255,77,28,.25)" : undefined,
        overflow: mode === "edit" && selected ? "visible" : "hidden",
        animationDuration: motion ? `${motion.duration}ms` : undefined,
        animationDelay: motion ? `${motion.delay}ms` : undefined,
        animationIterationCount: motion?.infinite ? "infinite" : motion?.iterations || 1,
        ...boxStyle(style),
      }}
    >
      <ElementBody element={element} mode={mode} websiteId={websiteId} siteSlug={siteSlug} lazy={lazy} reduced={reduced} />
      {mode === "edit" && selected && !element.locked && (["nw", "ne", "sw", "se"] as const).map((direction) => (
        <span
          key={direction}
          role="presentation"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onResizeStart?.(element.id, direction, event);
          }}
          style={{
            position: "absolute",
            width: 12,
            height: 12,
            background: "#fff",
            border: "2px solid #ff4d1c",
            borderRadius: 3,
            zIndex: 9999,
            left: direction.endsWith("w") ? -6 : undefined,
            right: direction.endsWith("e") ? -6 : undefined,
            top: direction.startsWith("n") ? -6 : undefined,
            bottom: direction.startsWith("s") ? -6 : undefined,
            cursor: direction === "nw" || direction === "se" ? "nwse-resize" : "nesw-resize",
            touchAction: "none",
          }}
        />
      ))}
    </div>
  );
}

function boxStyle(style: ElementStyle): React.CSSProperties {
  return {
    color: style.color,
    background: style.gradient || style.background,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textAlign: style.textAlign,
    borderRadius: style.radius,
    boxShadow: style.shadow,
    border: style.borderWidth ? `${style.borderWidth}px solid ${style.borderColor || "currentColor"}` : undefined,
    padding: style.padding,
    filter: style.blur ? `blur(${style.blur}px)` : undefined,
  };
}

function ElementBody({ element, mode, websiteId, siteSlug, lazy, reduced }: { element: ElementNode; mode: Mode; websiteId?: string; siteSlug?: string; lazy: boolean; reduced: boolean }) {
  const content = element.content;
  if (element.type === "heading") return <h2 className="display" style={{ margin: 0 }}>{String(content.text || "")}</h2>;
  if (element.type === "text" || element.type === "paragraph" || element.type === "icon") {
    if (element.motion?.preset === "typewriter" && mode !== "edit" && !reduced) return <Typewriter text={String(content.text || "")} />;
    return <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{String(content.text || "")}</p>;
  }
  if (element.type === "image") {
    if (!content.src) return <div style={{ width: "100%", height: "100%", background: "#e7e1d8" }} />;
    return <img src={String(content.src)} alt={String(content.alt || "")} style={{ width: "100%", height: "100%", objectFit: element.style.objectFit || "cover" }} loading={lazy ? "lazy" : undefined} />;
  }
  if (element.type === "button") {
    const href = String(content.href || "#");
    const label = String(content.label || "Button");
    if (mode === "edit" || content.action === "none") return <span style={{ display: "grid", placeItems: "center", height: "100%" }}>{label}</span>;
    const pageHref = content.action === "page" && siteSlug ? `/s/${siteSlug}/${content.pageSlug || "home"}` : href;
    return <a href={pageHref} target={content.newTab ? "_blank" : undefined} rel={content.newTab ? "noreferrer" : undefined} style={{ display: "grid", placeItems: "center", height: "100%" }}>{label}</a>;
  }
  if (element.type === "video") {
    const id = youtubeId(content.youtubeId);
    if (!id) return <div style={{ padding: 12 }}>Add a YouTube link or 11-character id. Playback uses the official embed and does not autoplay.</div>;
    return <iframe title={String(content.title || "YouTube")} src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`} style={{ width: "100%", height: "100%", border: 0 }} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />;
  }
  if (element.type === "shape") {
    const shape = String(content.shape || "rect");
    return <div style={{ width: "100%", height: "100%", borderRadius: shape === "circle" ? "50%" : shape === "blob" ? "42% 58% 62% 38%" : undefined, clipPath: shape === "triangle" ? "polygon(50% 0, 100% 100%, 0 100%)" : undefined, background: "currentColor" }} />;
  }
  if (element.type === "card") {
    return (
      <div style={{ height: "100%" }}>
        {content.image ? <img src={String(content.image)} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 12 }} /> : null}
        <strong>{String(content.title || "")}</strong>
        <p style={{ margin: "6px 0 0" }}>{String(content.body || "")}</p>
      </div>
    );
  }
  if (element.type === "gallery" || element.type === "slider") return <Gallery images={(content.images as { src: string; alt?: string; caption?: string }[]) || []} slider={element.type === "slider"} />;
  if (element.type === "form") return <LiveForm websiteId={websiteId} elementId={element.id} content={content} live={mode !== "edit"} />;
  if (element.type === "navbar" || element.type === "footer") {
    const links = (content.links as { label?: string; href?: string }[]) || [];
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%", gap: 12 }}>
        <strong>{String(content.brand || content.text || "")}</strong>
        <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {links.map((link, index) => <a key={index} href={mode === "edit" ? undefined : String(link.href || "#")}>{link.label}</a>)}
        </span>
      </div>
    );
  }
  if (element.type === "countdown") return <Countdown target={String(content.target || "")} label={String(content.label || "")} done={String(content.done || "Time.")} />;
  if (element.type === "timeline") {
    const items = (content.items as { year?: string; title?: string; body?: string }[]) || [];
    return (
      <div>
        <strong>{String(content.title || "")}</strong>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {items.map((item, index) => <div key={index}><b>{item.year} · {item.title}</b><div>{item.body}</div></div>)}
        </div>
      </div>
    );
  }
  if (element.type === "testimonials") {
    const items = (content.items as { quote?: string; name?: string; role?: string }[]) || [];
    return (
      <div>
        <div className="kicker">{String(content.title || "")}</div>
        {items.map((item, index) => <blockquote key={index} style={{ margin: "12px 0" }}><p style={{ fontSize: 22 }}>&ldquo;{item.quote}&rdquo;</p><footer>{item.name} — {item.role}</footer></blockquote>)}
      </div>
    );
  }
  if (element.type === "social") {
    const links = (content.links as { network?: string; url?: string; label?: string }[]) || [];
    return <div style={{ display: "flex", gap: 16 }}>{links.map((link, index) => <a key={index} href={mode === "edit" ? undefined : String(link.url || "#")}>{link.network || link.label}</a>)}</div>;
  }
  if (element.type === "quiz") return <Quiz title={String(content.title || "")} questions={(content.questions as { q: string; options: string[]; answer: number }[]) || []} live={mode !== "edit"} />;
  if (element.type === "treasure") return <Treasure title={String(content.title || "")} clues={(content.clues as { text: string; answer: string }[]) || []} live={mode !== "edit"} />;
  if (element.type === "surprise") return <Surprise title={String(content.title || "")} message={String(content.message || "")} button={String(content.button || "Open")} live={mode !== "edit"} />;
  if (element.type === "guestbook") return <Guestbook websiteId={websiteId} elementId={element.id} title={String(content.title || "Guestbook")} live={mode !== "edit"} />;
  if (element.type === "wheel") return <Wheel title={String(content.title || "")} segments={(content.segments as { label: string; color: string }[]) || []} live={mode !== "edit"} />;
  if (element.type === "particles") return reduced || mode === "edit" ? <div style={{ width: "100%", height: "100%", background: "transparent" }} /> : <Particles color={String(content.color || "#ff4d1c")} density={Number(content.density) || 20} />;
  if (element.type === "divider") return <hr style={{ border: 0, borderTop: "1px solid currentColor", margin: 0 }} />;
  if (element.type === "spacer") return null;
  if (element.type === "container") return <div style={{ width: "100%", height: "100%" }}>{String(content.label || "")}</div>;
  return <div>{element.type}</div>;
}

function Gallery({ images, slider }: { images: { src: string; alt?: string; caption?: string }[]; slider: boolean }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return <div>Add images.</div>;
  if (!slider) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, height: "100%" }}>
        {images.map((image) => <img key={image.src} src={image.src} alt={image.alt || ""} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12 }} />)}
      </div>
    );
  }
  const current = images[index % images.length];
  return (
    <div style={{ height: "100%", position: "relative" }}>
      <img src={current.src} alt={current.alt || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <button className="btn small" type="button" style={{ position: "absolute", bottom: 12, left: 12 }} onClick={() => setIndex((v) => (v + images.length - 1) % images.length)}>Prev</button>
      <button className="btn small orange" type="button" style={{ position: "absolute", bottom: 12, right: 12 }} onClick={() => setIndex((v) => (v + 1) % images.length)}>Next</button>
    </div>
  );
}

function LiveForm({ websiteId, elementId, content, live }: { websiteId?: string; elementId: string; content: Record<string, unknown>; live: boolean }) {
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const fields = (content.fields as { id: string; label: string; type: string; required?: boolean }[]) || [];
  if (done) return <p>{done}</p>;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!live || !websiteId) return;
        const data = new FormData(event.currentTarget);
        const payload: Record<string, string> = {};
        data.forEach((value, key) => { payload[key] = String(value); });
        const res = await fetch("/api/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "form", websiteId, elementId, payload }) });
        const json = await res.json();
        if (!res.ok) setError(json.error || "Could not send");
        else setDone(String(content.success || "Received."));
      }}
    >
      <strong>{String(content.title || "")}</strong>
      {fields.map((field) => (
        <label key={field.id} className="field">
          <span>{field.label}</span>
          {field.type === "textarea" ? <textarea name={field.id} required={field.required} /> : <input name={field.id} type={field.type} required={field.required} />}
        </label>
      ))}
      {error && <p>{error}</p>}
      <button className="btn orange small" type="submit" disabled={!live}>{String(content.submitLabel || "Send")}</button>
    </form>
  );
}

function Countdown({ target, label, done }: { target: string; label: string; done: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const end = new Date(target).getTime();
  if (!end || Number.isNaN(end)) return <div>Set a target date.</div>;
  const diff = Math.max(0, end - now);
  if (diff === 0) return <div><b>{label}</b><p>{done}</p></div>;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return <div><div className="kicker">{label}</div><strong style={{ fontSize: 36 }}>{days}d {hours}h {mins}m {secs}s</strong></div>;
}

function Quiz({ title, questions, live }: { title: string; questions: { q: string; options: string[]; answer: number }[]; live: boolean }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [score, setScore] = useState<number | null>(null);
  return (
    <div>
      <strong>{title}</strong>
      {questions.map((question, index) => (
        <fieldset key={index} style={{ border: 0, padding: 0, marginTop: 10 }}>
          <legend>{question.q}</legend>
          {question.options.map((option, optionIndex) => (
            <label key={option} style={{ display: "block" }}>
              <input type="radio" name={`q${index}`} disabled={!live || score !== null} onChange={() => setPicked((prev) => { const next = [...prev]; next[index] = optionIndex; return next; })} /> {option}
            </label>
          ))}
        </fieldset>
      ))}
      {score === null ? <button className="btn small" type="button" disabled={!live} onClick={() => setScore(questions.reduce((sum, question, index) => sum + (picked[index] === question.answer ? 1 : 0), 0))}>Score</button> : <p>Score {score} / {questions.length}</p>}
    </div>
  );
}

function Treasure({ title, clues, live }: { title: string; clues: { text: string; answer: string }[]; live: boolean }) {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const clue = clues[step];
  if (!clue) return <p>You found it. Replace this ending with the real prize.</p>;
  return (
    <div>
      <strong>{title}</strong>
      <p>Clue {step + 1} of {clues.length}</p>
      <p>{clue.text}</p>
      <input value={value} onChange={(event) => setValue(event.target.value)} disabled={!live} />
      <button className="btn small orange" type="button" disabled={!live} onClick={() => {
        if (value.trim().toLowerCase() === clue.answer.trim().toLowerCase()) {
          setStep((v) => v + 1);
          setValue("");
          setError("");
        } else setError("Not that answer.");
      }}>Check</button>
      {error && <p>{error}</p>}
    </div>
  );
}

function Surprise({ title, message, button, live }: { title: string; message: string; button: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ perspective: 800, height: "100%" }}>
      <button type="button" className="btn" disabled={!live} onClick={() => setOpen(true)} style={{ display: open ? "none" : "inline-flex" }}>{button}</button>
      {open && <div style={{ transform: "rotateY(8deg)", transition: "transform .4s" }}><h3>{title}</h3><p>{message}</p></div>}
      {!open && <h3>{title}</h3>}
    </div>
  );
}

function Guestbook({ websiteId, elementId, title, live }: { websiteId?: string; elementId: string; title: string; live: boolean }) {
  const [entries, setEntries] = useState<{ id: string; name: string; message: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!websiteId) return;
    fetch("/api/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "guestbook-list", websiteId, elementId }) })
      .then((res) => res.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => undefined);
  }, [websiteId, elementId]);
  return (
    <div>
      <strong>{title}</strong>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (!live || !websiteId) return;
        const data = new FormData(event.currentTarget);
        const res = await fetch("/api/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "guestbook", websiteId, elementId, name: data.get("name"), message: data.get("message") }) });
        const json = await res.json();
        if (!res.ok) setError(json.error || "Could not save");
        else { setEntries(json.entries || []); event.currentTarget.reset(); }
      }}>
        <input name="name" placeholder="Name" required disabled={!live} />
        <input name="message" placeholder="Message" required disabled={!live} />
        <button className="btn small" type="submit" disabled={!live}>Sign</button>
      </form>
      {error && <p>{error}</p>}
      {entries.map((entry) => <p key={entry.id}><b>{entry.name}</b> — {entry.message}</p>)}
    </div>
  );
}

function Wheel({ title, segments, live }: { title: string; segments: { label: string; color: string }[]; live: boolean }) {
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState("");
  const gradient = useMemo(() => {
    if (!segments.length) return "#222";
    const slice = 360 / segments.length;
    return `conic-gradient(${segments.map((segment, index) => `${segment.color} ${index * slice}deg ${(index + 1) * slice}deg`).join(",")})`;
  }, [segments]);
  return (
    <div style={{ textAlign: "center" }}>
      <strong>{title}</strong>
      <div style={{ width: 180, height: 180, borderRadius: "50%", margin: "12px auto", background: gradient, transform: `rotate(${angle}deg)`, transition: "transform 1.1s cubic-bezier(.15,.8,.2,1)" }} />
      <button className="btn orange small" type="button" disabled={!live || !segments.length} onClick={() => {
        const index = Math.floor(Math.random() * segments.length);
        setAngle((value) => value + 720 + index * (360 / segments.length));
        setResult(segments[index]?.label || "");
      }}>Spin</button>
      {result && <p>Landed on {result}</p>}
    </div>
  );
}

function Particles({ color, density }: { color: string; density: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    const dots = Array.from({ length: Math.min(density, 40) }, () => ({ x: Math.random(), y: Math.random(), s: 1 + Math.random() * 2 }));
    let raf = 0;
    const draw = () => {
      frame += 1;
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      dots.forEach((dot, index) => {
        const y = (dot.y + frame / 400 + index * 0.01) % 1;
        ctx.globalAlpha = 0.4 + (index % 5) * 0.1;
        ctx.fillRect(dot.x * canvas.width, y * canvas.height, dot.s, dot.s);
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color, density]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%" }} />;
}

function Typewriter({ text }: { text: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCount((value) => (value >= text.length ? value : value + 1)), 28);
    return () => clearInterval(timer);
  }, [text]);
  return <p style={{ margin: 0 }}>{text.slice(0, count)}</p>;
}

function usePrefersReduced(forced: boolean) {
  const [reduced, setReduced] = useState(forced);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(forced || media.matches || navigator.hardwareConcurrency <= 2);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [forced]);
  return reduced;
}
