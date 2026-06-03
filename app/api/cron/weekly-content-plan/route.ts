// app/api/cron/weekly-content-plan/route.ts
import { NextResponse } from "next/server";
import { sendWeeklyContentPlan } from "@/agents/social-marketing";

export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("authorization") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sendWeeklyContentPlan();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
