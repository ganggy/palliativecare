import { NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/auth-request";
import { getPendingUserRequests } from "@/lib/data-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request);
    const url = new URL(request.url);
    const reviewerUserId = url.searchParams.get("reviewerUserId") ?? "";
    const rows = await getPendingUserRequests({ reviewerUserId, token });
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "โหลดคำขอไม่สำเร็จ" },
      { status: 403 },
    );
  }
}
