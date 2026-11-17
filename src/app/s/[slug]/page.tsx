import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GateForm, PublishedSite } from "@/components/published";
import { ensureSeed } from "@/db/seed";
import { hasSiteGateAccess } from "@/lib/http";
import { runDueJobs } from "@/lib/jobs";
import { getPublicSite, publicDocument } from "@/lib/websites";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublicSite(slug);
  if (!site) return { title: "Site" };
  return { title: site.seoTitle || site.name, description: site.seoDescription || undefined, openGraph: { title: site.seoTitle || site.name, description: site.seoDescription || undefined, images: site.ogImage ? [site.ogImage] : undefined } };
}

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureSeed();
  await runDueJobs();
  const { slug } = await params;
  const site = await getPublicSite(slug);
  if (!site) notFound();
  if (site.status === "EXPIRED") return <main className="section"><h1 className="display">This site has expired</h1><p>The owner can renew publishing. The site was not deleted.</p></main>;
  const document = publicDocument(site);
  if (!document) notFound();
  if (!(await hasSiteGateAccess(site.id, site.passwordHash))) return <GateForm slug={slug} />;
  return <PublishedSite websiteId={site.id} slug={site.slug} document={document} branding={!site.removeBranding} />;
}
