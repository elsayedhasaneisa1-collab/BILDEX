import { ensureSeed } from "@/db/seed";
import { requireUser } from "@/lib/auth";
import { assertCsrf, handle, readJson } from "@/lib/http";
import { createPost, fileReport, rateDesigner, toggleFollow, togglePostLike, toggleSiteLike, toggleSiteSave } from "@/lib/social";

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(req);
    const action = String(body.action || "");
    if (action === "follow") return toggleFollow(user, String(body.designerId));
    if (action === "post") return createPost(user, String(body.body || ""), body.imageUrl ? String(body.imageUrl) : undefined);
    if (action === "like-post") return togglePostLike(user, String(body.postId));
    if (action === "rate-designer") return rateDesigner(user, String(body.designerId), Number(body.score), String(body.comment || ""));
    if (action === "like-site") return toggleSiteLike(user, String(body.websiteId));
    if (action === "save-site") return toggleSiteSave(user, String(body.websiteId));
    if (action === "report") return fileReport(user, String(body.targetType), String(body.targetId), String(body.reason || ""), String(body.details || ""));
    throw new Error("Unknown action");
  });
}
