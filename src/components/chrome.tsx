"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { t, type Lang } from "@/lib/i18n";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="logo" aria-label="BUILDEX">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill={light ? "#fffcf8" : "#141414"} />
        <path d="M8 6h8.2c3.6 0 5.8 1.8 5.8 4.5 0 1.8-1 3.2-2.6 3.9 2.1.6 3.4 2.2 3.4 4.4 0 3.1-2.5 5.2-6.4 5.2H8V6zm4 3.2v4.2h3.8c1.4 0 2.2-.7 2.2-1.9s-.8-2.3-2.3-2.3H12zm0 7.2v4.6h4.4c1.6 0 2.6-.8 2.6-2.2s-1-2.4-2.7-2.4H12z" fill="#ff4d1c" />
      </svg>
      <span>
        BUILDEX
        <small>BUILD BEYOND LIMITS</small>
      </span>
    </Link>
  );
}

export function SiteHeader({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const links = [
    ["/", "Home"],
    ["/templates", "Explore templates"],
    ["/designers", "Designers"],
    ["/features", "Features"],
    ["/pricing", "Pricing"],
  ] as const;
  function setLang(next: Lang) {
    document.cookie = `bx_lang=${next}; path=/; max-age=31536000; samesite=lax`;
    location.reload();
  }
  return (
    <header className="site-header">
      <Logo />
      <nav className={`nav-links ${open ? "open" : ""}`} aria-label="Primary">
        {links.map(([href, label]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}>{t(lang, label)}</Link>
        ))}
      </nav>
      <div className="nav-actions">
        <div className="lang-switch" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")} type="button">EN</button>
          <button className={lang === "ar" ? "on" : ""} onClick={() => setLang("ar")} type="button">AR</button>
        </div>
        <Link className="btn ghost small" href="/login">{t(lang, "Sign in")}</Link>
        <Link className="btn orange small" href="/register">{t(lang, "Start free")}</Link>
        <button className="menu-toggle" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Menu</button>
      </div>
    </header>
  );
}

export function SiteFooter({ lang }: { lang: Lang }) {
  const columns = [
    ["Product", [["/features", "Features"], ["/templates", "Templates"], ["/features", "Editor"], ["/pricing", "Pricing"]]],
    ["Resources", [["/help", "Help Center"], ["/faq", "FAQ"], ["/updates", "Updates"], ["/academy", "Academy"]]],
    ["Company", [["/about", "About"], ["/contact", "Contact"], ["/join", "Join the team"]]],
    ["Legal", [["/legal/privacy", "Privacy"], ["/legal/terms", "Terms"], ["/legal/cookies", "Cookies"], ["/legal/refund", "Refund policy"]]],
  ] as const;
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <Logo light />
          <p className="muted" style={{ color: "#b7b1a8", maxWidth: 280 }}>
            {lang === "ar"
              ? "منصة لبناء المواقع وتصميمها وتحريكها ونشرها. بلا ذكاء اصطناعي داخل المنتج، وبصلاحيات تُفحص على الخادم."
              : "Build, design, motion, and publish. No AI inside the product. Permissions are checked on the server."}
          </p>
          <p><Link href="/designers/buildex-studio">{lang === "ar" ? "الاستوديو الرسمي" : "Official studio"}</Link></p>
          <p><Link href="/explore">{lang === "ar" ? "المواقع المنشورة" : "Published sites"}</Link></p>
        </div>
        {columns.map(([title, links]) => (
          <FooterCol key={title} title={t(lang, title)} links={links.map(([href, label]) => [href, t(lang, label)] as [string, string])} />
        ))}
      </div>
      <div className="footer-base">
        <span>© 2026 BUILDEX. All rights reserved.</span>
        <span>Developed by <span className="dev">EL-sayed Hasan</span></span>
        <a href="#top">{t(lang, "Back to top")}</a>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="footer-acc">
      <h4 onClick={() => setOpen((v) => !v)}>{title}</h4>
      <div className={open ? "" : "desk-only"}>
        {links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </div>
      <style>{`@media (min-width: 981px){ .desk-only{display:block} } @media (max-width: 980px){ .desk-only{display:${open ? "block" : "none"}} }`}</style>
    </div>
  );
}

export function AppSide({
  lang,
  items,
  active,
  extra,
}: {
  lang: Lang;
  items: { href: string; label: string }[];
  active: string;
  extra?: ReactNode;
}) {
  return (
    <aside className="side">
      <Logo />
      <div style={{ height: 12 }} />
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={active === item.href ? "active" : ""}>
          {t(lang, item.label)}
        </Link>
      ))}
      <div style={{ marginTop: "auto" }}>{extra}</div>
    </aside>
  );
}
