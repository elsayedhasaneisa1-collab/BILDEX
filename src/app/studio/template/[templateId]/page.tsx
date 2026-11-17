import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { templates } from "@/db/schema";
import { Studio } from "@/components/studio/studio";
import { adviseDocument } from "@/lib/advisor";
import { requireUser } from "@/lib/auth";
import { featuresFor } from "@/lib/constants";
import { ensureSeed } from "@/db/seed";
import { inspectDocument } from "@/lib/inspector";
import { canCreateTemplates } from "@/lib/templates";

export const metadata = { robots: { index: false, follow: false } };

export default async function TemplateStudioPage({ params }: { params: Promise<{ templateId: string }> }) {
  await ensureSeed();
  const user = await requireUser();
  if (!(await canCreateTemplates(user))) notFound();
  const { templateId } = await params;
  const rows = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  const template = rows[0];
  if (!template || template.designerId !== user.id) notFound();
  const document = template.pendingDocument || template.document;
  return (
    <Studio
      kind="template"
      id={template.id}
      initialName={template.name}
      status={template.status}
      slug={template.slug}
      initialDoc={document}
      features={featuresFor("pro")}
      versions={[]}
      issues={inspectDocument(document)}
      advice={adviseDocument(document, template.tier)}
    />
  );
}
