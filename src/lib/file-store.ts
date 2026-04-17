import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function persistVisitPhoto(
  patientId: number,
  fileName: string,
  dataUrl: string,
) {
  const { buffer } = parseDataUrl(dataUrl);
  const timestamp = Date.now();
  const safeName = `${timestamp}-${sanitizeSegment(fileName || "visit-photo.jpg")}`;
  const relativeDir = path.join("uploads", "visits", String(patientId));
  const absoluteDir = path.join(process.cwd(), "public", relativeDir);
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, safeName), buffer);
  return `/${relativeDir.replaceAll("\\", "/")}/${safeName}`;
}
