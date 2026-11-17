import { notFound } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { adviseDocument } from "@/lib/advisor";
import { requireUser } from "@/lib/auth";
import { inspectDocument } from "@/lib/inspector";
import { getOwnedWebsite, listVersions } from "@/lib/websites";
import { ensureSeed } from "@/db/seed";

export const metadata = { robots: { index: false, follow: false } };

export default async function StudioPage({ params }: { params: Promise<{ websiteId: string }> }) {
  await ensureSeed();
  const user = await requireUser();
  const { websiteId } = await params;
  const site = await getOwnedWebsite(user, websiteId).catch(() => null);
  if (!site) notFound();
  const versions = await listVersions(user, websiteId);
  return (
    <Studio
      kind="website"
      id={site.id}
      initialName={site.name}
      status={site.status}
      slug={site.slug}
      initialDoc={site.document}
      features={user.features}
      versions={versions.map((version) => ({ id: version.id, label: version.label, createdAt: version.createdAt.toISOString() }))}
      issues={inspectDocument(site.document)}
      advice={adviseDocument(site.document, site.category)}
    />
  );
}
