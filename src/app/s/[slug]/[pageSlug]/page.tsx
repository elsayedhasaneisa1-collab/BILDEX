import { notFound } from "next/navigation";
import { GateForm, PublishedSite } from "@/components/published";
import { ensureSeed } from "@/db/seed";
import { hasSiteGateAccess } from "@/lib/http";
import { runDueJobs } from "@/lib/jobs";
import { getPublicSite, pageBySlug, publicDocument } from "@/lib/websites";

export default async function PublicInnerPage({ params }: { params: Promise<{ slug: string; pageSlug: string }> }) {
  await ensureSeed();
  await runDueJobs();
  const { slug, pageSlug } = await params;
  const site = await getPublicSite(slug);
  if (!site) notFound();
  const document = publicDocument(site);
  if (!document || !pageBySlug(document, pageSlug)) notFound();
  if (!(await hasSiteGateAccess(site.id, site.passwordHash))) return <GateForm slug={slug} />;
  return <PublishedSite websiteId={site.id} slug={site.slug} document={document} pageSlug={pageSlug} branding={!site.removeBranding} />;
}
