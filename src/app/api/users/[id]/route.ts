import { NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/auth-request";
import { adminUpdateUser, getSessionUserFromToken, renameAppUser } from "@/lib/data-service";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const token = extractBearerToken(request);
    const actor = await getSessionUserFromToken(token);
    if (!actor) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    if (actor.id === id) {
      await renameAppUser(id, body.displayName);
    } else {
      if (
        actor.role !== "hospital_admin" &&
        actor.role !== "hospital_case_manager"
      ) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      await adminUpdateUser({
        actorUserId: actor.id,
        token,
        targetUserId: id,
        username: typeof body.username === "string" ? body.username : undefined,
        displayName: body.displayName,
        role: body.role,
        unitId: body.unitId,
        active: typeof body.active === "boolean" ? body.active : undefined,
        password: typeof body.password === "string" ? body.password : undefined,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "อัปเดตผู้ใช้ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
