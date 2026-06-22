import { NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/auth-request";
import { reviewUserRequest } from "@/lib/data-service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const token = extractBearerToken(request);
    const body = await request.json();
    await reviewUserRequest({
      reviewerUserId: String(body.reviewerUserId ?? ""),
      targetUserId: id,
      approved: Boolean(body.approved),
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : undefined,
      token,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "อัปเดตคำขอไม่สำเร็จ" },
      { status: 403 },
    );
  }
}
