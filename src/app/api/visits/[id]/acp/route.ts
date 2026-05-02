import { NextResponse } from "next/server";
import { saveVisitAdvanceCarePlan } from "@/lib/data-service";
import { persistAdvanceCarePlanPdf } from "@/lib/file-store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const visitId = Number(id);
  const body = await request.json();
  if (!body.actorUserId || !body.form || !body.snapshotJpegDataUrl) {
    throw new Error("ข้อมูล ACP/LW ไม่ครบ");
  }
  const patientId = Number(body.patientId);
  if (!patientId) throw new Error("ไม่พบรหัสผู้ป่วยสำหรับจัดเก็บ PDF");

  const file = await persistAdvanceCarePlanPdf(
    patientId,
    visitId,
    `acp-lw-${visitId}.pdf`,
    body.snapshotJpegDataUrl,
  );
  const result = await saveVisitAdvanceCarePlan(visitId, {
    actorUserId: body.actorUserId,
    form: body.form,
    fileName: file.fileName,
    url: file.url,
  });

  return NextResponse.json({ ok: true, document: result.document });
}
