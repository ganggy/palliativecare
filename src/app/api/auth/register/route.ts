import { NextResponse } from "next/server";
import { registerAppUserRequest } from "@/lib/data-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await registerAppUserRequest({
      username: String(body.username ?? ""),
      displayName: String(body.displayName ?? ""),
      password: String(body.password ?? ""),
      role: body.role,
      unitId: String(body.unitId ?? ""),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "สมัครสมาชิกไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
