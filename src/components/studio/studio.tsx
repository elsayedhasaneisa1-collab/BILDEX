"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/chrome";
import { SiteCanvas } from "@/components/studio/renderer";
import { api } from "@/lib/client";
import { CANVAS, makeElement, uid } from "@/lib/document";
import type { Advice } from "@/lib/advisor";
import type { QualityIssue } from "@/lib/inspector";
import type { ElementNode, MotionPreset, PageDoc, PlanFeatures, SectionNode, WebsiteDocument } from "@/lib/types";

const PALETTE = ["heading", "text", "paragraph", "image", "button", "video", "icon", "shape", "container", "card", "gallery", "slider", "form", "navbar", "footer", "countdown", "timeline", "testimonials", "social", "quiz", "treasure", "surprise", "guestbook", "wheel", "particles", "divider", "spacer"];

export function Studio({
  kind,
  id,
  initialName,
  status,
  slug,
  initialDoc,
  features,
  versions,
  issues,
  advice,
}: {
  kind: "website" | "template";
  id: string;
  initialName: string;
  status: string;
  slug: string;
  initialDoc: WebsiteDocument;
  features: PlanFeatures;
  versions: { id: string; label: string; createdAt: string }[];
  issues: QualityIssue[];
  advice: Advice[];
}) {
  const [doc, setDoc] = useState(initialDoc);
  const [name, setName] = useState(initialName);
  const [pageId, setPageId] = useState(initialDoc.pages[0]?.id || "");
  const [sectionId, setSectionId] = useState(initialDoc.pages[0]?.sections[0]?.id || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState("elements");
  const [bp, setBp] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [zoom, setZoom] = useState(0.72);
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState("Saved");
  const [past, setPast] = useState<WebsiteDocument[]>([]);
  const [future, setFuture] = useState<WebsiteDocument[]>([]);
  const [panel, setPanel] = useState<"props" | "quality" | "advice" | "publish">("props");
  const [message, setMessage] = useState("");
  const [localIssues, setLocalIssues] = useState(issues);
  const [localAdvice, setLocalAdvice] = useState(advice);
  const drag = useRef<{ id: string; dx: number; dy: number; before: WebsiteDocument; group: Record<string, { x: number; y: number }> } | null>(null);
  const resize = useRef<{ id: string; direction: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; box: { x: number; y: number; w: number; h: number; r: number; z: number }; before: WebsiteDocument } | null>(null);
  const page = doc.pages.find((item) => item.id === pageId) || doc.pages[0];
  const section = page?.sections.find((item) => item.id === sectionId) || page?.sections[0];
  const selectedElement = section?.elements.find((item) => item.id === selected[0]);

  useEffect(() => {
    const key = `bx-draft-${kind}-${id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { doc: WebsiteDocument; at: number };
      if (saved.at > new Date(initialDoc ? Date.now() : 0).getTime() - 1000 && JSON.stringify(saved.doc) !== JSON.stringify(initialDoc)) {
        if (confirm("A local draft is newer than the last server copy. Restore it?")) setDoc(saved.doc);
      }
    } catch { /* ignore broken local draft */ }
  }, [id, kind, initialDoc]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setSaveState(navigator.onLine ? "Saving" : "Offline copy");
      localStorage.setItem(`bx-draft-${kind}-${id}`, JSON.stringify({ doc, at: Date.now() }));
      try {
        if (kind === "website") await api(`/api/websites/${id}`, { document: doc }, "PATCH");
        else await api(`/api/templates/${id}`, { action: "save", document: doc });
        setSaveState("Saved");
        setMessage("");
      } catch (error) {
        setSaveState("Not saved");
        setMessage(error instanceof Error ? error.message : "Save failed");
      }
    }, 900);
    return () => clearTimeout(handle);
  }, [doc, id, kind]);

  function commit(next: WebsiteDocument) {
    setPast((items) => [...items.slice(-40), doc]);
    setFuture([]);
    setDoc(next);
  }
  function updateElement(elementId: string, patch: Partial<ElementNode>) {
    commit({
      ...doc,
      pages: doc.pages.map((item) => item.id !== page?.id ? item : {
        ...item,
        sections: item.sections.map((sec) => sec.id !== section?.id ? sec : {
          ...sec,
          elements: sec.elements.map((element) => element.id === elementId ? { ...element, ...patch, style: patch.style || element.style, content: patch.content || element.content, box: patch.box || element.box } : element),
        }),
      }),
    });
  }
  function addElement(type: string) {
    if (!section || !page) return;
    const element = defaultElement(type, section.elements.length);
    const gate = planGate(type, features);
    if (gate) { setMessage(gate); return; }
    commit(mapSection(doc, page.id, section.id, (sec) => ({ ...sec, elements: [...sec.elements, element] })));
    setSelected([element.id]);
  }
  function addSection(preset: string) {
    if (!page) return;
    const next = presetSection(preset);
    commit({ ...doc, pages: doc.pages.map((item) => item.id === page.id ? { ...item, sections: [...item.sections, next] } : item) });
    setSectionId(next.id);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          const next = future[0];
          if (!next) return;
          setFuture((items) => items.slice(1));
          setPast((items) => [...items, doc]);
          setDoc(next);
        } else {
          const prev = past[past.length - 1];
          if (!prev) return;
          setPast((items) => items.slice(0, -1));
          setFuture((items) => [doc, ...items]);
          setDoc(prev);
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!section || !selected.length) return;
        commit(mapSection(doc, page.id, section.id, (sec) => ({ ...sec, elements: sec.elements.filter((element) => !selected.includes(element.id) || element.locked) })));
        setSelected([]);
      }
      if (meta && event.key.toLowerCase() === "d" && selectedElement) {
        event.preventDefault();
        const copy = { ...structuredClone(selectedElement), id: uid(), box: { ...selectedElement.box, x: selectedElement.box.x + 16, y: selectedElement.box.y + 16 } };
        commit(mapSection(doc, page.id, section!.id, (sec) => ({ ...sec, elements: [...sec.elements, copy] })));
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && selectedElement && !selectedElement.locked) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const box = { ...selectedElement.box };
        if (event.key === "ArrowUp") box.y -= step;
        if (event.key === "ArrowDown") box.y += step;
        if (event.key === "ArrowLeft") box.x -= step;
        if (event.key === "ArrowRight") box.x += step;
        updateElement(selectedElement.id, { box });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onPointerDown(elementId: string, event: React.PointerEvent) {
    if (!section) return;
    const element = section.elements.find((item) => item.id === elementId);
    if (!element || element.locked) return;
    const ids = selected.includes(elementId) ? selected : [elementId];
    const group: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const found = section.elements.find((item) => item.id === id);
      if (found) group[id] = { x: found.box.x, y: found.box.y };
    }
    drag.current = { id: elementId, dx: event.clientX, dy: event.clientY, before: doc, group };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onResizeStart(elementId: string, direction: "nw" | "ne" | "sw" | "se", event: React.PointerEvent) {
    if (!section) return;
    const element = section.elements.find((item) => item.id === elementId);
    if (!element || element.locked) return;
    const override = bp === "tablet" ? element.tablet : bp === "mobile" ? element.mobile : undefined;
    resize.current = {
      id: elementId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...element.box, ...override },
      before: doc,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (resize.current && section && page) {
      const active = resize.current;
      const dx = (event.clientX - active.startX) / zoom;
      const dy = (event.clientY - active.startY) / zoom;
      let { x, y, w, h } = active.box;
      if (active.direction.endsWith("e")) w = Math.max(24, active.box.w + dx);
      if (active.direction.endsWith("w")) { w = Math.max(24, active.box.w - dx); x = active.box.x + active.box.w - w; }
      if (active.direction.startsWith("s")) h = Math.max(24, active.box.h + dy);
      if (active.direction.startsWith("n")) { h = Math.max(24, active.box.h - dy); y = active.box.y + active.box.h - h; }
      const box = { ...active.box, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      setDoc(mapSection(active.before, page.id, section.id, (sec) => ({
        ...sec,
        elements: sec.elements.map((element) => {
          if (element.id !== active.id) return element;
          if (bp === "tablet") return { ...element, tablet: box };
          if (bp === "mobile") return { ...element, mobile: box };
          return { ...element, box };
        }),
      })));
      return;
    }
    if (!drag.current || !section || !page) return;
    const dx = (event.clientX - drag.current.dx) / zoom;
    const dy = (event.clientY - drag.current.dy) / zoom;
    const ids = Object.keys(drag.current.group);
    setDoc(mapSection(drag.current.before, page.id, section.id, (sec) => ({
      ...sec,
      elements: sec.elements.map((element) => {
        const origin = drag.current?.group[element.id];
        if (!origin) return element;
        let x = Math.round(origin.x + dx);
        let y = Math.round(origin.y + dy);
        if (ids.length === 1) {
          const snapped = snap(x, y, element.box.w, element.box.h, sec.elements.filter((item) => item.id !== element.id), CANVAS[bp]);
          x = snapped.x;
          y = snapped.y;
        }
        const box = { ...element.box, x, y };
        if (bp === "tablet") return { ...element, tablet: { ...element.tablet, ...box } };
        if (bp === "mobile") return { ...element, mobile: { ...element.mobile, ...box } };
        return { ...element, box };
      }),
    })));
  }
  function onPointerUp() {
    if (resize.current) setPast((items) => [...items.slice(-40), resize.current!.before]);
    else if (drag.current) setPast((items) => [...items.slice(-40), drag.current!.before]);
    resize.current = null;
    drag.current = null;
  }

  async function publish() {
    const seoTitle = (document.getElementById("seoTitle") as HTMLInputElement | null)?.value;
    const seoDescription = (document.getElementById("seoDescription") as HTMLInputElement | null)?.value;
    const showInExplore = (document.getElementById("explore") as HTMLInputElement | null)?.checked;
    try {
      await api(`/api/websites/${id}/actions`, { action: "publish", seoTitle, seoDescription, showInExplore, category: "personal" });
      setMessage("Published. The live link is ready.");
      setPanel("props");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish failed");
    }
  }

  if (!page || !section) return <p>This document has no page.</p>;
  return (
    <div className="studio" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <header className="studio-top">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Logo />
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Project name" style={{ background: "transparent", border: 0, color: "white", fontWeight: 700, width: 180 }} />
          <span className="badge dark">{status}</span>
          <span style={{ color: "#b7b1a8", fontSize: 12 }}>{saveState}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn ghost small" type="button" onClick={() => { const prev = past.at(-1); if (!prev) return; setPast((items) => items.slice(0, -1)); setFuture((items) => [doc, ...items]); setDoc(prev); }}>Undo</button>
          <button className="btn ghost small" type="button" onClick={() => { const next = future[0]; if (!next) return; setFuture((items) => items.slice(1)); setPast((items) => [...items, doc]); setDoc(next); }}>Redo</button>
          {(["desktop", "tablet", "mobile"] as const).map((item) => <button key={item} className={`btn small ${bp === item ? "orange" : "ghost"}`} type="button" onClick={() => setBp(item)}>{item}</button>)}
          <button className="btn ghost small" type="button" onClick={() => setZoom((value) => Math.max(0.35, value - 0.1))}>-</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="btn ghost small" type="button" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}>+</button>
          <button className="btn ghost small" type="button" onClick={() => setPreview((value) => !value)}>{preview ? "Edit" : "Preview"}</button>
          {kind === "website" && <Link className="btn ghost small" href={`/preview/${id}`}>Live preview</Link>}
          {kind === "website" && <button className="btn orange small" type="button" onClick={() => setPanel("publish")}>Publish</button>}
          {kind === "template" && <button className="btn orange small" type="button" onClick={async () => { await api(`/api/templates/${id}`, { action: "submit" }); setMessage("Submitted for review. It is not public until staff publish it."); }}>Submit review</button>}
        </div>
      </header>
      <div className="studio-body">
        <aside className="studio-side">
          <div className="tabbar">
            {["elements", "sections", "layers", "pages", "assets", "components", "animations", "system"].map((item) => (
              <button key={item} className={tab === item ? "on" : ""} type="button" onClick={() => setTab(item)}>{item}</button>
            ))}
          </div>
          {tab === "elements" && PALETTE.map((type) => <button key={type} className="palette-btn" type="button" onClick={() => addElement(type)}>{type}</button>)}
          {tab === "sections" && ["Hero", "Text", "Cards", "Gallery", "Form", "Footer"].map((preset) => <button key={preset} className="palette-btn" type="button" onClick={() => addSection(preset)}>{preset}</button>)}
          {tab === "layers" && section.elements.slice().sort((a, b) => b.box.z - a.box.z).map((element) => (
            <button key={element.id} className={`layer-row ${selected.includes(element.id) ? "on" : ""}`} type="button" onClick={() => setSelected([element.id])}>
              {element.hidden ? "○" : "●"} {element.name}
              <span>
                <i role="button" onClick={(event) => { event.stopPropagation(); updateElement(element.id, { hidden: !element.hidden }); }}>hide</i>
                {" "}
                <i role="button" onClick={(event) => { event.stopPropagation(); updateElement(element.id, { locked: !element.locked }); }}>{element.locked ? "unlock" : "lock"}</i>
              </span>
            </button>
          ))}
          {tab === "pages" && (
            <div style={{ padding: 8 }}>
              {doc.pages.map((item) => <button key={item.id} className="palette-btn" type="button" onClick={() => { setPageId(item.id); setSectionId(item.sections[0]?.id || ""); }}>{item.name}</button>)}
              <button className="btn small" type="button" onClick={() => {
                const next: PageDoc = { id: uid(), name: `Page ${doc.pages.length + 1}`, slug: `page-${doc.pages.length + 1}`, background: "#f6f3ee", sections: [presetSection("Hero")] };
                commit({ ...doc, pages: [...doc.pages, next] });
                setPageId(next.id);
              }}>Add page</button>
            </div>
          )}
          {tab === "assets" && <AssetPane onPick={(url) => selectedElement && updateElement(selectedElement.id, { content: { ...selectedElement.content, src: url, image: url } })} />}
          {tab === "components" && (
            <div style={{ padding: 8 }}>
              <button className="btn small" type="button" onClick={() => {
                if (!selectedElement) return;
                commit({ ...doc, components: [...doc.components, { id: uid(), name: selectedElement.name, elements: [structuredClone(selectedElement)] }] });
              }}>Save selection</button>
              {doc.components.map((component) => <button key={component.id} className="palette-btn" type="button" onClick={() => {
                const copies = component.elements.map((element) => ({ ...structuredClone(element), id: uid(), box: { ...element.box, x: element.box.x + 12, y: element.box.y + 12 } }));
                commit(mapSection(doc, page.id, section.id, (sec) => ({ ...sec, elements: [...sec.elements, ...copies] })));
              }}>{component.name}</button>)}
            </div>
          )}
          {tab === "animations" && ["none", "fade", "slide", "zoom", "rotate", "scale", "cinematic", "typewriter", "morph", "parallax", "particles"].map((preset) => (
            <button key={preset} className="palette-btn" type="button" onClick={() => {
              if (!selectedElement) return setMessage("Select an element first.");
              const gate = motionGate(preset, features);
              if (gate) return setMessage(gate);
              updateElement(selectedElement.id, { motion: { preset: preset as MotionPreset, duration: 700, delay: 0, easing: "ease-out", trigger: preset === "parallax" ? "scroll" : "load", iterations: 1, infinite: false, keyframes: [] } });
            }}>{preset}</button>
          ))}
          {tab === "system" && <ThemePane doc={doc} onChange={commit} />}
          <div style={{ padding: 8 }}>
            <button className="btn ghost small" type="button" onClick={() => setPanel("quality")}>Quality</button>
            <button className="btn ghost small" type="button" onClick={() => setPanel("advice")}>Advice</button>
          </div>
        </aside>
        <div className="canvas-scroll">
          {message && <p className="notice">{message}</p>}
          <div style={{ width: CANVAS[bp] * zoom, margin: "0 auto" }}>
            <SiteCanvas doc={doc} page={page} breakpoint={bp} mode={preview ? "preview" : "edit"} scale={zoom} websiteId={kind === "website" ? id : undefined} siteSlug={slug} selectedIds={selected} onSelect={(elementId, additive) => setSelected(additive ? [...selected, elementId] : [elementId])} onPointerDown={onPointerDown} onResizeStart={onResizeStart} />
          </div>
        </div>
        <aside className="studio-props">
          {panel === "publish" && kind === "website" && (
            <div style={{ padding: 12 }}>
              <h3>Publish</h3>
              <p>The public site updates only when you publish. Draft edits stay private.</p>
              <label className="field"><span>SEO title</span><input id="seoTitle" defaultValue={name} /></label>
              <label className="field"><span>SEO description</span><input id="seoDescription" defaultValue="" /></label>
              <label><input id="explore" type="checkbox" /> Show in Explore</label>
              <p>Password, schedule, custom domain, and brand removal are checked against your plan on the server.</p>
              <button className="btn orange" type="button" onClick={publish}>Publish now</button>
              <p><a href={`/s/${slug}`}>/{`s/${slug}`}</a></p>
            </div>
          )}
          {panel === "quality" && (
            <div style={{ padding: 12 }}>
              <h3>Smart Inspector</h3>
              <button className="btn small" type="button" onClick={async () => {
                const data = await api<{ issues: QualityIssue[] }>(`/api/websites/${id}`);
                setLocalIssues(data.issues || []);
              }}>Run check</button>
              {localIssues.map((issue) => (
                <article key={issue.id} className="card" style={{ marginTop: 8, background: "#1c1c1c", color: "white" }}>
                  <b>{issue.title}</b>
                  <p>{issue.where}</p>
                  <p>{issue.cause}</p>
                  <p>{issue.remedy}</p>
                  {issue.auto && <button className="btn small orange" type="button" onClick={async () => {
                    const data = await api<{ document: WebsiteDocument }>(`/api/websites/${id}/actions`, { action: "fix", issueId: issue.id });
                    commit(data.document);
                  }}>Fix issue</button>}
                </article>
              ))}
              {!localIssues.length && <p>No issues in the last check.</p>}
            </div>
          )}
          {panel === "advice" && (
            <div style={{ padding: 12 }}>
              <h3>Design Advisor</h3>
              <p>Rules only. Nothing is applied until you confirm.</p>
              {localAdvice.map((item) => (
                <article key={item.id} className="card" style={{ marginTop: 8, background: "#1c1c1c", color: "white" }}>
                  <b>{item.title}</b>
                  <p>{item.reason}</p>
                  <p>{item.benefit}</p>
                  <button className="btn small orange" type="button" onClick={async () => {
                    const data = await api<{ document: WebsiteDocument }>(`/api/websites/${id}/actions`, { action: "advice", adviceId: item.id });
                    commit(data.document);
                  }}>Apply</button>
                  <button className="btn small ghost" type="button" onClick={async () => {
                    const data = await api<{ document: WebsiteDocument }>(`/api/websites/${id}/actions`, { action: "advice", adviceId: item.id, ignore: true });
                    commit(data.document);
                    setLocalAdvice((list) => list.filter((adviceItem) => adviceItem.id !== item.id));
                  }}>Ignore</button>
                </article>
              ))}
            </div>
          )}
          {panel === "props" && selectedElement && (
            <Props element={selectedElement} bp={bp} features={features} onChange={(patch) => updateElement(selectedElement.id, patch)} onGroup={() => {
              const groupId = uid();
              commit(mapSection(doc, page.id, section.id, (sec) => ({ ...sec, elements: sec.elements.map((element) => selected.includes(element.id) ? { ...element, groupId } : element) })));
            }} onUngroup={() => updateElement(selectedElement.id, { groupId: undefined })} />
          )}
          {panel === "props" && !selectedElement && <div style={{ padding: 12 }}><p>Select an element. Drag to move. Shift-click to add to the selection. Delete removes. Ctrl+D duplicates. Ctrl+Z undoes.</p>{versions.length > 0 && <VersionList id={id} versions={versions} onRestore={(document) => commit(document)} />}</div>}
        </aside>
      </div>
    </div>
  );
}

function Props({ element, bp, features, onChange, onGroup, onUngroup }: { element: ElementNode; bp: "desktop" | "tablet" | "mobile"; features: PlanFeatures; onChange: (patch: Partial<ElementNode>) => void; onGroup: () => void; onUngroup: () => void }) {
  const box = bp === "mobile" && element.mobile ? { ...element.box, ...element.mobile } : bp === "tablet" && element.tablet ? { ...element.box, ...element.tablet } : element.box;
  function setBox(key: "x" | "y" | "w" | "h" | "r", value: number) {
    const next = { ...box, [key]: value };
    if (bp === "tablet") onChange({ tablet: next });
    else if (bp === "mobile") onChange({ mobile: next });
    else onChange({ box: next });
  }
  function updateFrame(index: number, patch: Partial<NonNullable<ElementNode["motion"]>["keyframes"][number]>) {
    const current = element.motion?.keyframes || [];
    onChange({ motion: { preset: element.motion?.preset || "fade", duration: element.motion?.duration || 800, delay: element.motion?.delay || 0, easing: element.motion?.easing || "ease-out", trigger: element.motion?.trigger || "load", iterations: element.motion?.iterations || 1, infinite: element.motion?.infinite || false, keyframes: current.map((frame, frameIndex) => frameIndex === index ? { ...frame, ...patch } : frame) } });
  }
  return (
    <div className="prop" style={{ padding: 12, display: "grid", gap: 8 }}>
      <strong>{element.name}</strong>
      <label>Text<textarea value={String(element.content.text || element.content.title || element.content.label || "")} onChange={(event) => onChange({ content: { ...element.content, text: event.target.value, title: event.target.value, label: event.target.value } })} /></label>
      <label>Link<input value={String(element.content.href || "")} onChange={(event) => onChange({ content: { ...element.content, href: event.target.value } })} /></label>
      <label>Image<input value={String(element.content.src || "")} onChange={(event) => onChange({ content: { ...element.content, src: event.target.value } })} /></label>
      <label>Color<input type="color" value={toHex(element.style.color)} onChange={(event) => onChange({ style: { ...element.style, color: event.target.value } })} /></label>
      <label>Background<input type="color" value={toHex(element.style.background)} onChange={(event) => onChange({ style: { ...element.style, background: event.target.value } })} /></label>
      <label>Size<input type="number" value={element.style.fontSize || 16} onChange={(event) => onChange({ style: { ...element.style, fontSize: Number(event.target.value) } })} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {(["x", "y", "w", "h", "r"] as const).map((key) => <label key={key}>{key}<input type="number" value={box[key]} onChange={(event) => setBox(key, Number(event.target.value))} /></label>)}
      </div>
      <button className="btn small ghost" type="button" onClick={onGroup}>Group</button>
      <button className="btn small ghost" type="button" onClick={onUngroup}>Ungroup</button>
      {features.timeline && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 8 }}>
          <strong>Motion timeline</strong>
          <label>Duration (ms)<input type="number" min={100} max={10000} value={element.motion?.duration || 800} onChange={(event) => onChange({ motion: { preset: element.motion?.preset || "fade", duration: Number(event.target.value), delay: element.motion?.delay || 0, easing: element.motion?.easing || "ease-out", trigger: element.motion?.trigger || "load", iterations: element.motion?.iterations || 1, infinite: element.motion?.infinite || false, keyframes: element.motion?.keyframes || [] } })} /></label>
          <button className="btn small" type="button" onClick={() => {
            const current = element.motion?.keyframes || [];
            const t = current.length ? Math.min(100, Math.max(...current.map((frame) => frame.t)) + 20) : 0;
            onChange({ motion: { preset: element.motion?.preset || "fade", duration: element.motion?.duration || 800, delay: element.motion?.delay || 0, easing: element.motion?.easing || "ease-out", trigger: "load", iterations: 1, infinite: false, keyframes: [...current, { t, opacity: 1, y: 0, scale: 1 }] } });
          }}>Add keyframe</button>
          {(element.motion?.keyframes || []).map((frame, index) => (
            <div key={index} className="card" style={{ padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <label>Time %<input type="number" min={0} max={100} value={frame.t} onChange={(event) => updateFrame(index, { t: Number(event.target.value) })} /></label>
              <label>Opacity<input type="number" min={0} max={1} step={0.1} value={frame.opacity ?? 1} onChange={(event) => updateFrame(index, { opacity: Number(event.target.value) })} /></label>
              <label>X<input type="number" value={frame.x ?? 0} onChange={(event) => updateFrame(index, { x: Number(event.target.value) })} /></label>
              <label>Y<input type="number" value={frame.y ?? 0} onChange={(event) => updateFrame(index, { y: Number(event.target.value) })} /></label>
              <label>Scale<input type="number" min={0.1} max={4} step={0.1} value={frame.scale ?? 1} onChange={(event) => updateFrame(index, { scale: Number(event.target.value) })} /></label>
              <label>Rotate<input type="number" value={frame.rotate ?? 0} onChange={(event) => updateFrame(index, { rotate: Number(event.target.value) })} /></label>
              {features.threeD && <><label>Rotate X<input type="number" value={frame.rotateX ?? 0} onChange={(event) => updateFrame(index, { rotateX: Number(event.target.value) })} /></label><label>Rotate Y<input type="number" value={frame.rotateY ?? 0} onChange={(event) => updateFrame(index, { rotateY: Number(event.target.value) })} /></label></>}
              <button className="btn small line" type="button" onClick={() => onChange({ motion: { ...element.motion!, keyframes: (element.motion?.keyframes || []).filter((_, frameIndex) => frameIndex !== index) } })}>Remove frame</button>
            </div>
          ))}
          <small>Timeline animations play in Preview and on the published page. Parallax follows page scrolling.</small>
        </div>
      )}
    </div>
  );
}

function ThemePane({ doc, onChange }: { doc: WebsiteDocument; onChange: (doc: WebsiteDocument) => void }) {
  return (
    <div className="prop" style={{ padding: 8 }}>
      <label>Accent<input type="color" value={doc.theme.accent} onChange={(event) => onChange({ ...doc, theme: { ...doc.theme, accent: event.target.value } })} /></label>
      <label>Ink<input type="color" value={doc.theme.ink} onChange={(event) => onChange({ ...doc, theme: { ...doc.theme, ink: event.target.value } })} /></label>
      <label>Paper<input type="color" value={doc.theme.paper} onChange={(event) => onChange({ ...doc, theme: { ...doc.theme, paper: event.target.value } })} /></label>
      <label>Radius<input type="number" value={doc.theme.radius} onChange={(event) => onChange({ ...doc, theme: { ...doc.theme, radius: Number(event.target.value) } })} /></label>
    </div>
  );
}

function AssetPane({ onPick }: { onPick: (url: string) => void }) {
  const [items, setItems] = useState<{ id: string; url: string }[]>([]);
  useEffect(() => { api<{ items: { id: string; url: string }[] }>("/api/media").then((data) => setItems(data.items || [])).catch(() => undefined); }, []);
  return (
    <div style={{ padding: 8 }}>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const body = new FormData();
        body.set("file", file);
        const data = await api<{ asset: { id: string; url: string } }>("/api/media", body);
        setItems((prev) => [data.asset, ...prev]);
        onPick(data.asset.url);
      }} />
      {items.map((item) => <button key={item.id} className="palette-btn" type="button" onClick={() => onPick(item.url)}>{item.url.split("/").pop()}</button>)}
    </div>
  );
}

function VersionList({ id, versions, onRestore }: { id: string; versions: { id: string; label: string; createdAt: string }[]; onRestore: (doc: WebsiteDocument) => void }) {
  return (
    <div>
      <h3>Versions</h3>
      {versions.map((version) => (
        <button key={version.id} className="palette-btn" type="button" onClick={async () => {
          const data = await api<{ document: WebsiteDocument }>(`/api/websites/${id}/actions`, { action: "restore", versionId: version.id });
          onRestore(data.document);
        }}>{version.label} · {new Date(version.createdAt).toLocaleString()}</button>
      ))}
    </div>
  );
}

function mapSection(doc: WebsiteDocument, pageId: string, sectionId: string, fn: (section: SectionNode) => SectionNode): WebsiteDocument {
  return { ...doc, pages: doc.pages.map((page) => page.id !== pageId ? page : { ...page, sections: page.sections.map((section) => section.id === sectionId ? fn(section) : section) }) };
}

function snap(x: number, y: number, w: number, h: number, others: ElementNode[], canvas: number) {
  let nx = x;
  let ny = y;
  const edges = [0, canvas / 2 - w / 2, canvas - w];
  for (const edge of edges) if (Math.abs(x - edge) < 6) nx = edge;
  for (const other of others) {
    if (Math.abs(x - other.box.x) < 6) nx = other.box.x;
    if (Math.abs(y - other.box.y) < 6) ny = other.box.y;
    if (Math.abs(x + w - (other.box.x + other.box.w)) < 6) nx = other.box.x + other.box.w - w;
  }
  void h;
  return { x: nx, y: ny };
}

function defaultElement(type: string, index: number): ElementNode {
  return makeElement(type, { x: 48 + (index % 3) * 20, y: 48 + index * 12, w: type === "button" ? 180 : 320, h: type === "heading" ? 90 : 80, z: index + 1 }, { text: type, label: "Continue", href: "#", title: type, alt: type }, { color: "#161616", fontSize: type === "heading" ? 42 : 16, background: type === "button" ? "#ff4d1c" : "transparent" }, type);
}

function presetSection(preset: string): SectionNode {
  if (preset === "Hero") return { id: uid(), name: "Hero", locked: false, hidden: false, height: 520, background: "#141414", elements: [makeElement("heading", { x: 64, y: 140, w: 700, h: 120 }, { text: "A new section." }, { color: "#ffffff", fontSize: 56, fontWeight: 740 }, "Heading")] };
  if (preset === "Cards") return { id: uid(), name: "Cards", locked: false, hidden: false, height: 360, background: "#f6f3ee", elements: [makeElement("card", { x: 48, y: 48, w: 280, h: 180 }, { title: "Point", body: "Replace this." }, { background: "#ffffff", radius: 16, padding: 16 }, "Card")] };
  if (preset === "Gallery") return { id: uid(), name: "Gallery", locked: false, hidden: false, height: 420, background: "#ffffff", elements: [makeElement("gallery", { x: 48, y: 40, w: 1100, h: 320 }, { images: [] }, {}, "Gallery")] };
  if (preset === "Form") return { id: uid(), name: "Form", locked: false, hidden: false, height: 420, background: "#ffffff", elements: [makeElement("form", { x: 48, y: 40, w: 480, h: 320 }, { title: "Write us", submitLabel: "Send", fields: [{ id: "name", label: "Name", type: "text", required: true }] }, { background: "#f6f3ee", padding: 16, radius: 16 }, "Form")] };
  if (preset === "Footer") return { id: uid(), name: "Footer", locked: false, hidden: false, height: 140, background: "#111", elements: [makeElement("footer", { x: 48, y: 40, w: 800, h: 48 }, { text: "Footer", links: [] }, { color: "#ddd" }, "Footer")] };
  return { id: uid(), name: "Text", locked: false, hidden: false, height: 280, background: "#fff", elements: [makeElement("paragraph", { x: 48, y: 48, w: 640, h: 120 }, { text: "Write the section." }, { color: "#333", fontSize: 18 }, "Text")] };
}

function planGate(type: string, features: PlanFeatures) {
  if (["gallery", "slider"].includes(type) && !features.galleries) return "Galleries require Plus.";
  if (type === "countdown" && !features.countdown) return "Countdown requires Plus.";
  if (["quiz", "treasure", "wheel", "guestbook", "surprise"].includes(type) && !features.games) return "Interactive pieces require Plus.";
  return "";
}
function motionGate(preset: string, features: PlanFeatures) {
  if (preset === "parallax" && !features.parallax) return "Parallax requires Pro.";
  if (preset === "particles" && !features.motionEditor) return "Particles require Pro.";
  if (["zoom", "rotate", "scale", "cinematic", "typewriter", "morph"].includes(preset) && !features.advancedTransitions && !features.motionEditor) return "This motion requires Plus.";
  return "";
}
function toHex(color?: string) {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#161616";
}
