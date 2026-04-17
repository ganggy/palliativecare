import { NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/auth-request";
import { getSessionUserFromToken } from "@/lib/data-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = await getSessionUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user });
}
