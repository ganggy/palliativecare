import { NextResponse } from "next/server";
import { loginAppUser } from "@/lib/data-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await loginAppUser({
      username: String(body.username ?? ""),
      password: String(body.password ?? ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
