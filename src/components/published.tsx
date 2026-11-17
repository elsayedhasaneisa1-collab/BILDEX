"use client";

import { useEffect, useState } from "react";
import { SiteCanvas } from "@/components/studio/renderer";
import type { WebsiteDocument } from "@/lib/types";

export function PublishedSite({
  websiteId,
  slug,
  document,
  pageSlug,
  branding,
}: {
  websiteId: string;
  slug: string;
  document: WebsiteDocument;
  pageSlug?: string;
  branding: boolean;
}) {
  const page = document.pages.find((item) => item.slug === pageSlug) || document.pages[0];
  const [width, setWidth] = useState(1100);
  useEffect(() => {
    const sync = () => setWidth(Math.min(window.innerWidth, 1280));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  const bp = width < 760 ? "mobile" : width < 1100 ? "tablet" : "desktop";
  const canvas = bp === "mobile" ? 390 : bp === "tablet" ? 834 : 1280;
  useEffect(() => {
    const start = Date.now();
    fetch("/api/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "view", websiteId, pageSlug: page?.slug || "home" }) }).catch(() => undefined);
    const sendDuration = () => {
      navigator.sendBeacon("/api/public", new Blob([JSON.stringify({ intent: "duration", websiteId, pageSlug: page?.slug || "home", durationMs: Date.now() - start })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", sendDuration);
    return () => window.removeEventListener("pagehide", sendDuration);
  }, [websiteId, page?.slug]);
  if (!page) return <p>This page is missing.</p>;
  return (
    <div className="site-wrap">
      <SiteCanvas doc={document} page={page} breakpoint={bp} mode="live" scale={width / canvas} websiteId={websiteId} siteSlug={slug} />
      {branding && <div className="brand-mark">Made with <a href="/">BUILDEX</a></div>}
    </div>
  );
}

export function GateForm({ slug }: { slug: string }) {
  return (
    <form className="card" style={{ maxWidth: 420, margin: "10vh auto" }} onSubmit={async (event) => {
      event.preventDefault();
      const password = String(new FormData(event.currentTarget).get("password") || "");
      const res = await fetch("/api/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "gate", slug, password }) });
      if (res.ok) location.reload();
      else alert("Wrong site password");
    }}>
      <h1>This site is locked</h1>
      <label className="field"><span>Password</span><input name="password" type="password" required /></label>
      <button className="btn orange" type="submit">Enter</button>
    </form>
  );
}
