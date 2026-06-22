import { NextResponse } from "next/server";
import { persistVisitPhoto } from "@/lib/file-store";
import { saveVisit } from "@/lib/data-service";
import { validateVisitSubmission } from "@/lib/rules";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const patientId = Number(id);
    if (!Number.isFinite(patientId)) {
      return NextResponse.json(
        { error: "รหัสผู้ป่วยไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const body = await request.json();
    validateVisitSubmission({
      visitDate: body.visitDate,
      authenCode: body.authenCode,
      symptoms: body.symptoms,
      photosCount: Array.isArray(body.photos) ? body.photos.length : 0,
    });
    const photos = await Promise.all(
      (body.photos ?? []).map(
        async (photo: { fileName: string; dataUrl: string; caption?: string }) => ({
          caption: photo.caption,
          fileName: photo.fileName,
          url: await persistVisitPhoto(patientId, photo.fileName, photo.dataUrl),
        }),
      ),
    );

    await saveVisit(patientId, {
      visitDate: body.visitDate,
      authenCode: body.authenCode,
      symptoms: body.symptoms,
      note: body.note ?? "",
      visitorUserId: body.visitorUserId,
      visitorName: body.visitorName,
      unitId: body.unitId,
      checklist: body.checklist,
      clinical: body.clinical,
      photos,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "บันทึกการเยี่ยมไม่สำเร็จ",
      },
      { status: 400 },
    );
  }
}
