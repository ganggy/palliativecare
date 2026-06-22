import { NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/auth-request";
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  getAppSnapshot,
  getSessionUserFromToken,
} from "@/lib/data-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request);
    const actor = await getSessionUserFromToken(token);
    if (!actor || (actor.role !== "hospital_admin" && actor.role !== "hospital_case_manager")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const snapshot = await getAppSnapshot();
    return NextResponse.json(snapshot.users);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "โหลดผู้ใช้ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request);
    const body = await request.json();
    await adminCreateUser({
      actorUserId: String(body.actorUserId ?? ""),
      token,
      username: String(body.username ?? ""),
      displayName: String(body.displayName ?? ""),
      password: String(body.password ?? ""),
      role: body.role,
      unitId: String(body.unitId ?? ""),
      active: body.active === undefined ? true : Boolean(body.active),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "เพิ่มผู้ใช้ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const token = extractBearerToken(request);
    const body = await request.json();
    await adminUpdateUser({
      actorUserId: String(body.actorUserId ?? ""),
      token,
      targetUserId: String(body.targetUserId ?? ""),
      username: typeof body.username === "string" ? body.username : undefined,
      displayName:
        typeof body.displayName === "string" ? body.displayName : undefined,
      role: body.role,
      unitId: typeof body.unitId === "string" ? body.unitId : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "แก้ไขผู้ใช้ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const token = extractBearerToken(request);
    const body = await request.json();
    await adminDeleteUser({
      actorUserId: String(body.actorUserId ?? ""),
      token,
      targetUserId: String(body.targetUserId ?? ""),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ลบผู้ใช้ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
