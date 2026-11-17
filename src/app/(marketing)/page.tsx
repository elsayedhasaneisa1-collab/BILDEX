import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { designerProfiles, subscriptionPlans, templates, users } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { money } from "@/lib/http";
import { getLang } from "@/lib/lang";

export default async function HomePage() {
  await ensureSeed();
  const lang = await getLang();
  const ar = lang === "ar";
  const featured = await db.select({ id: templates.id, slug: templates.slug, name: templates.name, previewImage: templates.previewImage, price: templates.price, tier: templates.tier, usesCount: templates.usesCount })
    .from(templates).where(eq(templates.status, "PUBLISHED")).orderBy(desc(templates.usesCount)).limit(4);
  const designers = await db.select({
    profile: { verified: designerProfiles.verified, official: designerProfiles.official },
    user: { id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl, headline: users.headline },
  }).from(designerProfiles).innerJoin(users, eq(users.id, designerProfiles.userId)).limit(4);
  const plans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
  return (
    <>
      <section className="hero">
        <div className="blueprint" />
        <div className="hero-grid">
          <div>
            <p className="kicker">BUILDEX · Build Beyond Limits</p>
            <h1 className="display">{ar ? "ابنِ الموقع. صمّمه. حرّكه. انشره." : "Build it. Shape it. Move it. Publish it."}</h1>
            <p className="lede">{ar ? "منصة مواقع بلا برمجة: قوالب حقيقية، محرر بصري، فحص بالقواعد، ونشر برابط خاص. لا يوجد ذكاء اصطناعي داخل المنتج، وكل صلاحية تُفحص على الخادم." : "A website studio without code and without AI inside the product. Real templates, a visual editor, rule-based checks, and a link you can open on another device."}</p>
            <div className="hero-actions">
              <Link className="btn orange" href="/register">{ar ? "ابدأ مجانًا" : "Start free"}</Link>
              <Link className="btn ghost" href="/templates">{ar ? "استكشف القوالب" : "Explore templates"}</Link>
            </div>
          </div>
          <div className="stage-3d">
            <div className="stage-frame">
              <img src="/images/hero-studio.png" alt={ar ? "معاينة بصرية لمحرر BUILDEX" : "BUILDEX studio canvas"} />
            </div>
          </div>
        </div>
        <div className="float-chip">{ar ? "إطار ثلاثي الأبعاد خفيف. لا مكتبات ثقيلة." : "Light CSS 3D. No heavy scene engine."}</div>
      </section>
      <section className="section" id="how">
        <p className="kicker">{ar ? "كيف تعمل" : "How it works"}</p>
        <h2 className="display">{ar ? "أربع خطوات، وكلها تُنفَّذ." : "Four steps, all of them real."}</h2>
        <div className="grid-4">
          {[
            [ar ? "اختر قالبًا" : "Choose a template", ar ? "من المكتبة المنشورة فقط. المسودات لا تظهر." : "Only published catalog work. Drafts stay hidden."],
            [ar ? "خصّص التصميم" : "Shape the design", ar ? "اسحب العناصر، غيّر الخصائص، واحفظ تلقائيًا." : "Drag elements, edit properties, autosave."],
            [ar ? "عاين موقعك" : "Preview it", ar ? "المعاينة تشغّل الروابط والنماذج والعدّادات." : "Preview runs links, forms, and countdowns."],
            [ar ? "انشر الرابط" : "Publish the link", ar ? "يظهر على /s/slug ويمكن فتحه من جهاز آخر." : "It goes live at /s/slug and opens on another device."],
          ].map(([title, body], index) => (
            <article className="card" key={title}>
              <div className="step-no">0{index + 1}</div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="dark-band">
        <div className="section">
          <p className="kicker">Features</p>
          <h2 className="display">{ar ? "أدوات بناء، لا أزرار شكلية." : "Building tools, not costume buttons."}</h2>
          <div className="grid-3">
            {[
              ["Visual Editor", ar ? "تحديد، سحب، تغيير حجم، تدوير، طبقات، وقفل." : "Select, drag, resize, rotate, layers, and lock."],
              ["Ready Templates", ar ? "مستندات قابلة للتعديل، لا صور ثابتة." : "Editable documents, not flat pictures."],
              ["Motion", ar ? "تلاشٍ، انزلاق، خط زمني، وتراجع للحركة." : "Fade, slide, timeline, and reduced motion."],
              ["Responsive", ar ? "كمبيوتر، لوحي، وهاتف دون كسر الباقي." : "Desktop, tablet, and phone without breaking the others."],
              ["Publishing", ar ? "نشر، إلغاء نشر، ورابط قصير." : "Publish, unpublish, and a short link."],
              ["Marketplace", ar ? "لا قالب عام بلا موافقة الإدارة." : "Nothing public without an admin decision."],
            ].map(([title, body]) => <article className="card" key={title}><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="page-title">
          <h2 className="display">{ar ? "قوالب مميزة" : "Featured templates"}</h2>
          <Link href="/templates">{ar ? "المكتبة" : "Library"}</Link>
        </div>
        <div className="grid-4">
          {featured.map((item) => (
            <Link className="card template-card" key={item.id} href={`/templates/${item.slug}`}>
              <img src={item.previewImage || "/images/og.png"} alt="" />
              <div>
                <span className="badge">{item.tier}</span>
                <h3>{item.name}</h3>
                <p className="price">{item.price ? money(item.price) : ar ? "مجاني" : "Free"}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="display">{ar ? "المكتب الرسمي" : "Official desk"}</h2>
        <div className="grid-3">
          {designers.map(({ user, profile }) => (
            <Link className="card" key={user.id} href={`/designers/${user.username}`}>
              <img src="/brand/mark.png" alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover" }} />
              <h3>{user.name} {profile.verified ? "✓" : ""}</h3>
              <p>@{user.username}</p>
              <p>{user.headline}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="display">{ar ? "الباقات" : "Plans"}</h2>
        <div className="grid-4">
          {plans.map((plan) => (
            <article className="card" key={plan.id}>
              <h3>{plan.name}</h3>
              <p className="price">{money(plan.priceMonthly)}<span className="muted"> / mo</span></p>
              <p>{plan.description}</p>
              <Link className="btn small" href={`/pricing?plan=${plan.key}`}>{ar ? "التفاصيل" : "Details"}</Link>
            </article>
          ))}
        </div>
      </section>
      <section className="section faq">
        <h2 className="display">{ar ? "أسئلة" : "Questions"}</h2>
        {[
          [ar ? "هل يوجد ذكاء اصطناعي؟" : "Is there AI?", ar ? "لا. الفحص والاقتراحات قواعد ثابتة." : "No. Inspection and advice are fixed rules."],
          [ar ? "هل تُحذف المواقع عند انتهاء الاشتراك؟" : "Are sites deleted when a plan ends?", ar ? "لا. تتوقف الصلاحيات الإضافية ويبقى العمل." : "No. Extra permissions stop. The work stays."],
          [ar ? "من ينشر القوالب؟" : "Who publishes templates?", ar ? "مراجع أو مدير يملك صلاحية النشر. المصمم لا يوافق على نفسه." : "A reviewer or admin with publish permission. Designers cannot approve themselves."],
        ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </section>
    </>
  );
}
