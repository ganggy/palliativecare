import { NextResponse } from "next/server";
import { getAppSnapshot } from "@/lib/data-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getAppSnapshot());
}
