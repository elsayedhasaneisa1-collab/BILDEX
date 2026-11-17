import { ensureSeed } from "@/db/seed";
import { requireUser } from "@/lib/auth";
import { assertCsrf, handle, readJson } from "@/lib/http";
import { createWebsite, listWebsites } from "@/lib/websites";

export async function GET() {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const items = await listWebsites(user);
    return { items };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const body = await readJson<{ name?: string; templateId?: string | null }>(req);
    const site = await createWebsite(user, { name: body.name || "", templateId: body.templateId });
    return { site: { id: site.id, name: site.name, slug: site.slug, status: site.status } };
  });
}
