import { runDueJobs } from "@/lib/jobs";
import { handle, HttpError, safeEqual } from "@/lib/http";

export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET || "";
    const authorization = req.headers.get("authorization") || "";
    if (secret.length < 32 || !safeEqual(authorization, `Bearer ${secret}`)) {
      throw new HttpError(401, "Unauthorized cron request.", "CRON_AUTH");
    }
    await runDueJobs();
    return { ok: true, ranAt: new Date().toISOString() };
  });
}
