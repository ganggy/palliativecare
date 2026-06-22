import { NextResponse } from "next/server";
import { updateVisit } from "@/lib/data-service";
import { persistVisitPhoto } from "@/lib/file-store";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const visitId = Number(id);
    if (!Number.isFinite(visitId)) {
      return NextResponse.json(
        { error: "รหัสการเยี่ยมไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const patientId = Number(body.patientId);
    if ((body.photos?.length ?? 0) > 0 && !Number.isFinite(patientId)) {
      return NextResponse.json(
        { error: "รหัสผู้ป่วยสำหรับบันทึกรูปไม่ถูกต้อง" },
        { status: 400 },
      );
    }
    const photos = await Promise.all(
      (body.photos ?? []).map(
        async (photo: { fileName: string; dataUrl: string; caption?: string }) => ({
          caption: photo.caption,
          fileName: photo.fileName,
          url: await persistVisitPhoto(patientId, photo.fileName, photo.dataUrl),
        }),
      ),
    );

    await updateVisit(visitId, {
      actorUserId: body.actorUserId,
      visitDate: body.visitDate,
      authenCode: body.authenCode,
      symptoms: body.symptoms,
      note: body.note ?? "",
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
            : "แก้ไขข้อมูลการเยี่ยมไม่สำเร็จ",
      },
      { status: 400 },
    );
  }
}
