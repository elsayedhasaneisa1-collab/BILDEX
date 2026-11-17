import { randomUUID } from "crypto";
import { Buffer } from "node:buffer";
import { unlink } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { requireUser } from "@/lib/auth";
import { assertCsrf, handle, HttpError } from "@/lib/http";

function sniff(buf: Buffer) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (buf.length > 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { mime: "image/gif", ext: "gif" };
  if (buf.length > 12 && buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

function supabaseStorageConfig() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "buildex-media";
  if (!base || !key) return null;
  return { base, key, bucket };
}

function catboxUserHash() {
  return process.env.CATBOX_USERHASH?.trim() || "";
}

function isCatboxFileUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "files.catbox.moe" && /^\/[a-z0-9_-]+\.(?:jpe?g|png|gif|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function uploadToCatbox(buffer: Buffer, filename: string, mime: string) {
  const userhash = catboxUserHash();
  if (process.env.NODE_ENV === "production" && !userhash) {
    throw new HttpError(503, "Configure CATBOX_USERHASH in the deployment environment before uploading images.", "CATBOX_CONFIG");
  }

  const form = new FormData();
  form.set("reqtype", "fileupload");
  if (userhash) form.set("userhash", userhash);
  form.set("fileToUpload", new Blob([new Uint8Array(buffer)], { type: mime }), filename);

  let response: Response;
  try {
    response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new HttpError(502, "Catbox could not be reached. Please try again.", "CATBOX_NETWORK");
  }

  const result = (await response.text()).trim();
  if (!response.ok || !isCatboxFileUrl(result)) {
    throw new HttpError(502, "Catbox rejected the image upload. Check the Catbox account hash and try again.", "CATBOX_UPLOAD");
  }
  return result;
}

async function deleteFromCatbox(fileUrl: string) {
  const userhash = catboxUserHash();
  if (!userhash) throw new HttpError(503, "Configure CATBOX_USERHASH to delete images from Catbox.", "CATBOX_CONFIG");

  let filename = "";
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== "https:" || url.hostname !== "files.catbox.moe") throw new Error("Invalid host");
    filename = url.pathname.slice(1);
  } catch {
    throw new HttpError(400, "The stored Catbox image URL is invalid.", "CATBOX_URL");
  }
  if (!/^[a-z0-9_-]+\.(?:jpe?g|png|gif|webp)$/i.test(filename)) {
    throw new HttpError(400, "The stored Catbox image filename is invalid.", "CATBOX_URL");
  }

  const form = new FormData();
  form.set("reqtype", "deletefiles");
  form.set("userhash", userhash);
  form.set("files", filename);

  let response: Response;
  try {
    response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HttpError(502, "Catbox could not be reached. The image was not removed.", "CATBOX_NETWORK");
  }

  const result = (await response.text()).trim();
  if (!response.ok || /\b(error|failed|invalid)\b/i.test(result)) {
    throw new HttpError(502, "Catbox could not delete the image. Check CATBOX_USERHASH.", "CATBOX_DELETE");
  }
}

export async function GET() {
  return handle(async () => {
    await ensureSeed();
    const user = await requireUser();
    const items = await db.select().from(mediaAssets).where(eq(mediaAssets.ownerId, user.id));
    return { items };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose an image.", "FILE");
    if (file.size > 4 * 1024 * 1024) throw new HttpError(400, "Images must be 4MB or smaller.", "FILE");
    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = sniff(buffer);
    if (!kind) throw new HttpError(400, "Only JPEG, PNG, WEBP, and GIF images are accepted.", "FILE");
    const id = randomUUID();
    const filename = `${id}.${kind.ext}`;
    const url = await uploadToCatbox(buffer, filename, kind.mime);
    const provider = "catbox";
    const [asset] = await db.insert(mediaAssets).values({ ownerId: user.id, url, mime: kind.mime, size: buffer.length, provider }).returning();
    return { asset };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await ensureSeed();
    await assertCsrf(req);
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id") || "";
    const rows = await db.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.ownerId, user.id))).limit(1);
    const asset = rows[0];
    if (!asset) throw new HttpError(404, "File not found.", "NOT_FOUND");
    if (asset.provider === "catbox") {
      await deleteFromCatbox(asset.url);
    } else if (asset.provider === "supabase") {
      const config = supabaseStorageConfig();
      if (!config) throw new HttpError(503, "Supabase Storage is not configured for this legacy image.", "STORAGE_CONFIG");
      const marker = `/storage/v1/object/public/${config.bucket}/`;
      const storagePath = asset.url.split(marker)[1];
      if (storagePath) {
        const response = await fetch(`${config.base}/storage/v1/object/${encodeURIComponent(config.bucket)}/${storagePath.split("/").map(decodeURIComponent).map(encodeURIComponent).join("/")}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${config.key}`, apikey: config.key },
          cache: "no-store",
        });
        if (!response.ok && response.status !== 404) throw new HttpError(502, "Could not remove the image from storage.", "STORAGE");
      }
    } else if (asset.url.startsWith("/media/uploads/")) {
      const filename = path.basename(asset.url);
      await unlink(path.join(process.cwd(), "public", "media", "uploads", filename)).catch(() => undefined);
    }
    await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
    return { ok: true };
  });
}
