import { ensureSeed } from "@/db/seed";
import { requireUser } from "@/lib/auth";
import { adminAct, loadAdmin } from "@/lib/admin";
import { assertCsrf, clientIp, handle, readJson } from "@/lib/http";

export async function GET(req: Request) {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const section = new URL(req.url).searchParams.get("section") || "overview";
    return { data: await loadAdmin(user, section) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(req);
    return adminAct(user, body, clientIp(req));
  });
}
