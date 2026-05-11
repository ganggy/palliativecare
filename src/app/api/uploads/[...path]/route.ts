import { readFile } from "node:fs/promises";
import path from "node:path";

const contentTypeByExtension: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  const filePath = path.resolve(uploadsRoot, ...segments);

  if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    return new Response("Invalid upload path", { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    const contentType =
      contentTypeByExtension[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream";
    return new Response(new Uint8Array(file), {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": contentType,
      },
    });
  } catch {
    return new Response("Upload not found", { status: 404 });
  }
}
