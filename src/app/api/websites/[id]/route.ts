import { ensureSeed } from "@/db/seed";
import { requireUser } from "@/lib/auth";
import { adviseDocument } from "@/lib/advisor";
import { inspectDocument } from "@/lib/inspector";
import { assertCsrf, handle, readJson } from "@/lib/http";
import { getOwnedWebsite, listSubmissions, listVersions, saveWebsiteDocument } from "@/lib/websites";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const { id } = await ctx.params;
    const site = await getOwnedWebsite(user, id);
    const versions = await listVersions(user, id);
    return {
      site,
      versions,
      issues: inspectDocument(site.document),
      advice: adviseDocument(site.document, site.category),
    };
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await readJson<{ document?: unknown }>(req);
    return saveWebsiteDocument(user, id, body.document);
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const { id } = await ctx.params;
    return { submissions: await listSubmissions(user, id) };
  });
}
