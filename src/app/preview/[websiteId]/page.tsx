import { notFound } from "next/navigation";
import { PublishedSite } from "@/components/published";
import { requireUser } from "@/lib/auth";
import { ensureSeed } from "@/db/seed";
import { getOwnedWebsite } from "@/lib/websites";

export const metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({ params }: { params: Promise<{ websiteId: string }> }) {
  await ensureSeed();
  const user = await requireUser();
  const { websiteId } = await params;
  const site = await getOwnedWebsite(user, websiteId).catch(() => null);
  if (!site) notFound();
  return <PublishedSite websiteId={site.id} slug={site.slug} document={site.document} branding={!site.removeBranding || user.features.branding} />;
}
