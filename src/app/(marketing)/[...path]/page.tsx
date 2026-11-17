import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPlans, templateCategories, templates } from "@/db/schema";
import { AuthForm, ContactForm, ForgotForm, ResetForm } from "@/components/forms";
import { DesignerActions, TemplateActions } from "@/components/interactive";
import { ARTICLES } from "@/lib/articles";
import { getSessionUser } from "@/lib/auth";
import { cacheRemember } from "@/lib/redis";
import { money } from "@/lib/http";
import { getLang } from "@/lib/lang";
import { designerByUsername, designerRatingSummary, exploreSites, followState, listPosts, publicDesigners } from "@/lib/social";
import { getPublishedTemplate, listTemplates, templateCommentsFor } from "@/lib/templates";

export async function generateMetadata({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return { title: (path[0] || "BUILDEX").replaceAll("-", " ") };
}

export default async function MarketingPath({ params, searchParams }: { params: Promise<{ path: string[] }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { path } = await params;
  const query = await searchParams;
  const lang = await getLang();
  const [root, slug] = path;
  if (root === "login") return <AuthForm mode="login" />;
  if (root === "register") return <AuthForm mode="register" />;
  if (root === "forgot-password") return <ForgotForm />;
  if (root === "reset-password") return <ResetForm token={query.token || ""} />;
  if (root === "templates" && !slug) return <TemplateLibrary query={query} />;
  if (root === "templates" && slug) return <TemplateDetail slug={slug} />;
  if (root === "designers" && !slug) return <DesignerList />;
  if (root === "designers" && slug) return <DesignerPage username={slug} />;
  if (root === "pricing") return <Pricing />;
  if (root === "features") return <Features ar={lang === "ar"} />;
  if (root === "explore") return <Explore q={query.q} />;
  if (root === "faq") return <Faq />;
  if (root === "about") return <About />;
  if (root === "contact") return <div className="section"><h1 className="display">Contact</h1><ContactForm /></div>;
  if (root === "join") return <div className="section"><h1 className="display">Join the team</h1><p>Applications are stored for staff. Sending one does not create an account or a role.</p><ContactForm intent="join" /></div>;
  if (root === "help" && !slug) return <ArticleIndex group="help" />;
  if (root === "help" && slug) return <Article group="help" slug={slug} />;
  if (root === "academy" && !slug) return <ArticleIndex group="academy" />;
  if (root === "academy" && slug) return <Article group="academy" slug={slug} />;
  if (root === "updates") return <Updates />;
  if (root === "legal" && slug) return <Article group="legal" slug={slug} />;
  notFound();
}

async function TemplateLibrary({ query }: { query: Record<string, string | undefined> }) {
  const data = await listTemplates({ q: query.q, group: query.group, category: query.category, sort: query.sort, page: Number(query.page || 1) });
  const categories = await cacheRemember("templates:categories", 300, () => db.select().from(templateCategories));
  return (
    <div className="section">
      <h1 className="display">Templates</h1>
      <form className="grid-4">
        <input name="q" defaultValue={query.q || ""} placeholder="Search" />
        <select name="group" defaultValue={query.group || ""}>
          <option value="">All groups</option>
          {[...new Set(categories.map((item) => item.group))].map((group) => <option key={group}>{group}</option>)}
        </select>
        <select name="category" defaultValue={query.category || ""}>
          <option value="">All categories</option>
          {categories.map((item) => <option key={item.id} value={item.key}>{item.name}</option>)}
        </select>
        <select name="sort" defaultValue={query.sort || "rating"}>
          <option value="rating">Top rated</option>
          <option value="new">Newest</option>
          <option value="used">Most used</option>
        </select>
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="grid-4" style={{ marginTop: 18 }}>
        {data.items.map(({ template, category, designer }) => (
          <Link key={template.id} href={`/templates/${template.slug}`} className="card template-card">
            <img src={template.previewImage || "/images/og.png"} alt="" />
            <div>
              <span className="badge">{category?.group || template.tier}</span>
              <h3>{template.name}</h3>
              <p>{template.price ? money(template.price) : "Free"} · {designer.name}</p>
            </div>
          </Link>
        ))}
      </div>
      {!data.items.length && <p className="notice">No published templates match. Categories without an approved template stay empty.</p>}
    </div>
  );
}

async function TemplateDetail({ slug }: { slug: string }) {
  const row = await getPublishedTemplate(slug);
  if (!row) notFound();
  const comments = await templateCommentsFor(row.template.id);
  const user = await getSessionUser();
  return (
    <div className="section">
      <div className="grid-2">
        <img src={row.template.previewImage || "/images/og.png"} alt="" style={{ width: "100%", height: 420, objectFit: "cover", borderRadius: 24 }} />
        <div>
          <p className="kicker">{row.category?.group} · {row.category?.name}</p>
          <h1 className="display">{row.template.name}</h1>
          <p>{row.template.description}</p>
          <p>{row.template.price ? money(row.template.price) : "Free"} · {row.template.tier} · {row.template.license}</p>
          <p>Uses {row.template.usesCount}</p>
          <p>By <Link href={`/designers/${row.designer.username}`}>{row.designer.name}</Link></p>
          {user ? <TemplateActions id={row.template.id} price={row.template.price} /> : <Link className="btn orange" href={`/login?next=/templates/${slug}`}>Sign in to use</Link>}
        </div>
      </div>
      <h2>Comments</h2>
      {comments.map((comment) => <article key={comment.id} className="card"><b>{comment.name}</b><p>{comment.body}</p></article>)}
    </div>
  );
}

async function DesignerList() {
  const rows = await publicDesigners();
  return (
    <div className="section">
      <h1 className="display">Designers</h1>
      <div className="grid-3">
        {rows.map(({ user, profile }) => (
          <Link key={user.id} href={`/designers/${user.username}`} className="card">
            <h3>{user.name} {profile.verified ? "✓" : ""}</h3>
            <p>@{user.username} {profile.official ? "· Official" : ""}</p>
            <p>{user.headline}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

async function DesignerPage({ username }: { username: string }) {
  const row = await designerByUsername(username);
  if (!row?.profile) notFound();
  const viewer = await getSessionUser();
  const follow = await followState(viewer?.id || null, row.user.id);
  const posts = await listPosts(row.user.id);
  const rating = await designerRatingSummary(row.user.id);
  const work = await db.select({ id: templates.id, slug: templates.slug, name: templates.name, previewImage: templates.previewImage, description: templates.description })
    .from(templates).where(and(eq(templates.designerId, row.user.id), eq(templates.status, "PUBLISHED")));
  const visibility = row.profile.visibility || { bio: true, skills: true, socialLinks: true, posts: true, portfolio: true };
  const socialLinks = Object.entries((row.profile.socialLinks || {}) as Record<string, string>).flatMap(([network, value]) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) ? [{ network, href: url.toString() }] : [];
    } catch {
      return [];
    }
  });
  return (
    <div>
      <div style={{ height: 260, background: `linear-gradient(120deg,rgba(12,14,20,.35),rgba(12,14,20,.08)),url(${row.profile.coverUrl || "/images/hero-studio.png"}) center/cover` }} />
      <div className="section">
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: -64, position: "relative", flexWrap: "wrap" }}>
          <img src={row.user.avatarUrl || "/brand/mark.png"} alt="" style={{ width: 112, height: 112, borderRadius: 28, objectFit: "cover", border: "4px solid var(--paper)", background: "var(--surface)" }} />
          <div>
            <p className="kicker">{row.profile.official ? "Official catalog desk" : "Designer"} {row.profile.verified ? "· Verified" : ""}</p>
            <h1 className="display">{row.user.name}</h1>
            <p>@{row.user.username} · {row.profile.membershipId}</p>
          </div>
        </div>
        {visibility.bio !== false && <p>{row.user.bio}</p>}
        <p>{follow.followers} followers · {follow.following} following · {rating.count ? `${rating.avg.toFixed(1)} / 5 (${rating.count} ratings)` : "No ratings"}</p>
        <p>{row.user.headline}</p>
        {visibility.skills !== false && <div className="grid-2"><article className="card"><h3>Skills</h3><p>{row.profile.skills.join(" · ") || "No skills added"}</p></article><article className="card"><h3>Specialties</h3><p>{row.profile.specialties.join(" · ") || "No specialties added"}</p></article></div>}
        {visibility.socialLinks !== false && socialLinks.length > 0 && <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{socialLinks.map((item) => <a key={item.network} className="btn small line" href={item.href} target="_blank" rel="noreferrer">{item.network}</a>)}</div>}
        <p><Link className="btn small" href={`/verify/${row.profile.membershipId}`}>Verify membership</Link></p>
        {visibility.portfolio !== false && <><h2>Published portfolio</h2><div className="grid-3">{work.map((item) => <Link key={item.id} className="card" href={`/templates/${item.slug}`}><img src={item.previewImage || "/images/og.png"} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 14 }} /><h3>{item.name}</h3><p>{item.description}</p></Link>)}</div></>}
        {visibility.posts !== false && <><h2>Posts</h2>{posts.map((post) => <article key={post.id} className="card"><p>{post.body}</p><small>{post.likes} likes</small></article>)}</>}
        {viewer && <DesignerActions designerId={row.user.id} following={follow.mine} />}
      </div>
    </div>
  );
}

async function Pricing() {
  const plans = await db.select().from(subscriptionPlans);
  return (
    <div className="section">
      <h1 className="display">Pricing</h1>
      <p>Prices live in the database. Paid orders are completed through the WhatsApp payment desk configured by the administrator, then activated after staff verify the transfer.</p>
      <div className="grid-4">
        {plans.map((plan) => (
          <article key={plan.id} className="card">
            <h2>{plan.name}</h2>
            <p>{money(plan.priceMonthly)} / month</p>
            <p>{money(plan.priceQuarterly)} / 3 months · {money(plan.priceYearly)} / year</p>
            <p>{plan.description}</p>
            <ul>
              <li>{plan.features.maxWebsites} websites</li>
              <li>{plan.features.templateTier} templates</li>
              <li>{plan.features.versionHistory} saved versions</li>
            </ul>
            <Link className="btn orange" href={plan.priceMonthly === 0 ? "/register" : "/dashboard/subscription"}>Choose</Link>
          </article>
        ))}
      </div>
    </div>
  );
}

function Features({ ar }: { ar: boolean }) {
  return (
    <div className="section">
      <h1 className="display">{ar ? "المميزات" : "Features"}</h1>
      <div className="grid-2">
        {[["Studio", "Drag, resize, rotate, snap, undo, pages, and autosave."], ["Motion", "Fade, slide, zoom, timeline, and reduced-motion fallback."], ["Inspector", "Overlaps, contrast, missing images, and mobile overflow."], ["Advisor", "Rule-based suggestions. Nothing applies until you confirm."], ["Publishing", "A public copy updates only when you publish."], ["Marketplace", "ZIP uploads are quarantined and never executed."]].map(([title, body]) => <article key={title} className="card"><h3>{title}</h3><p>{body}</p></article>)}
      </div>
    </div>
  );
}

async function Explore({ q }: { q?: string }) {
  const rows = await exploreSites(q);
  return (
    <div className="section">
      <h1 className="display">Explore</h1>
      <form><input name="q" defaultValue={q} placeholder="Search public sites" /><button className="btn small">Search</button></form>
      <div className="grid-3" style={{ marginTop: 16 }}>
        {rows.map(({ site, owner }) => (
          <article key={site.id} className="card">
            <h3>{site.name}</h3>
            <p>{owner.name}</p>
            <Link className="btn small" href={`/s/${site.slug}`}>Open</Link>
          </article>
        ))}
      </div>
      {!rows.length && <p>No owner has chosen to list a published site yet.</p>}
    </div>
  );
}

function Faq() {
  return <div className="section faq"><h1 className="display">FAQ</h1><details><summary>What does Free include?</summary><p>One website, free templates, basic motion, YouTube embeds, and the BUILDEX mark.</p></details><details><summary>Are sites deleted when a plan ends?</summary><p>No. Extra permissions stop. The work stays.</p></details></div>;
}
function About() {
  return <div className="section"><h1 className="display">About</h1><p>BUILDEX is a website studio. Roles and subscriptions are separate. Developed by <span className="dev">EL-sayed Hasan</span>.</p></div>;
}
function Updates() {
  return <div className="section"><h1 className="display">Updates</h1><article className="card"><h3>2026.1</h3><p>Studio, publishing, review, subscriptions, and Command Center are operating. Paid orders use the administrator-configured WhatsApp payment desk and require staff approval.</p></article></div>;
}
function ArticleIndex({ group }: { group: "help" | "academy" }) {
  return <div className="section"><h1 className="display">{group === "help" ? "Help Center" : "Academy"}</h1>{ARTICLES.filter((item) => item.group === group).map((item) => <p key={item.slug}><Link href={`/${group}/${item.slug}`}>{item.title}</Link></p>)}</div>;
}
function Article({ group, slug }: { group: string; slug: string }) {
  const item = ARTICLES.find((entry) => entry.group === group && entry.slug === slug);
  if (!item) notFound();
  return <article className="section"><p className="kicker">{group}</p><h1 className="display">{item.title}</h1>{item.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</article>;
}
