import { NextResponse } from "next/server";
import { persistVisitPhoto } from "@/lib/file-store";
import { saveVisit } from "@/lib/data-service";
import { validateVisitSubmission } from "@/lib/rules";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  validateVisitSubmission({
    visitDate: body.visitDate,
    authenCode: body.authenCode,
    symptoms: body.symptoms,
    photosCount: Array.isArray(body.photos) ? body.photos.length : 0,
  });
  const photos = await Promise.all(
    (body.photos ?? []).map(
      async (photo: { fileName: string; dataUrl: string }) => ({
        fileName: photo.fileName,
        url: await persistVisitPhoto(Number(id), photo.fileName, photo.dataUrl),
      }),
    ),
  );

  await saveVisit(Number(id), {
    visitDate: body.visitDate,
    authenCode: body.authenCode,
    symptoms: body.symptoms,
    note: body.note,
    visitorUserId: body.visitorUserId,
    visitorName: body.visitorName,
    unitId: body.unitId,
    checklist: body.checklist,
    photos,
  });

  return NextResponse.json({ ok: true });
}
