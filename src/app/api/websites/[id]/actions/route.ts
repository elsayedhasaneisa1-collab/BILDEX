import { ensureSeed } from "@/db/seed";
import { requireUser } from "@/lib/auth";
import { applyAdvice } from "@/lib/advisor";
import { applyIssueFix } from "@/lib/inspector";
import { assertCsrf, handle, readJson } from "@/lib/http";
import { getOwnedWebsite, mutateWebsite, saveWebsiteDocument } from "@/lib/websites";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await readJson<Record<string, unknown>>(req);
    const action = String(body.action || "");
    if (action === "fix") {
      const site = await getOwnedWebsite(user, id);
      const next = applyIssueFix(site.document, String(body.issueId || ""));
      await saveWebsiteDocument(user, id, next);
      return { document: next };
    }
    if (action === "advice") {
      const site = await getOwnedWebsite(user, id);
      if (body.ignore) {
        site.document.ignoredAdvice = [...new Set([...(site.document.ignoredAdvice || []), String(body.adviceId)])];
        await saveWebsiteDocument(user, id, site.document);
        return { document: site.document };
      }
      const next = applyAdvice(site.document, String(body.adviceId || ""));
      await saveWebsiteDocument(user, id, next);
      return { document: next };
    }
    return mutateWebsite(user, id, action, body);
  });
}
