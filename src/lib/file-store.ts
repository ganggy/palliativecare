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

function getJpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { width: 900, height: 1300 };
}

function makePdfFromJpeg(jpegBuffer: Buffer) {
  const dimensions = getJpegDimensions(jpegBuffer);
  const pageWidth = 595;
  const margin = 24;
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = (dimensions.height / dimensions.width) * imageWidth;
  const pageHeight = imageHeight + margin * 2;
  const objects: Buffer[] = [];
  const addObject = (content: Buffer | string) => {
    const index = objects.length + 1;
    objects.push(
      Buffer.concat([
        Buffer.from(`${index} 0 obj\n`),
        typeof content === "string" ? Buffer.from(content) : content,
        Buffer.from("\nendobj\n"),
      ]),
    );
    return index;
  };

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`,
  );
  addObject(
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${dimensions.width} /Height ${dimensions.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`,
      ),
      jpegBuffer,
      Buffer.from("\nendstream"),
    ]),
  );
  const content = `q\n${imageWidth.toFixed(2)} 0 0 ${imageHeight.toFixed(2)} ${margin} ${margin} cm\n/Im1 Do\nQ`;
  addObject(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);

  const header = Buffer.from("%PDF-1.4\n");
  const offsets: number[] = [];
  let position = header.length;
  for (const object of objects) {
    offsets.push(position);
    position += object.length;
  }
  const xrefStart = position;
  const xrefLines = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF",
  ].join("\n");
  return Buffer.concat([header, ...objects, Buffer.from(xrefLines)]);
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
  return `/api/${relativeDir.replaceAll("\\", "/")}/${safeName}`;
}

export async function persistAdvanceCarePlanPdf(
  patientId: number,
  visitId: number,
  fileName: string,
  jpegDataUrl: string,
) {
  const { mimeType, buffer } = parseDataUrl(jpegDataUrl);
  if (mimeType !== "image/jpeg" && mimeType !== "image/jpg") {
    throw new Error("ACP snapshot must be JPEG");
  }
  const safeName = `${Date.now()}-${sanitizeSegment(fileName || `acp-lw-${visitId}.pdf`)}`;
  const pdfName = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
  const relativeDir = path.join("uploads", "visits", String(patientId), "acp");
  const absoluteDir = path.join(process.cwd(), "public", relativeDir);
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, pdfName), makePdfFromJpeg(buffer));
  return {
    fileName: pdfName,
    url: `/${relativeDir.replaceAll("\\", "/")}/${pdfName}`,
  };
}
