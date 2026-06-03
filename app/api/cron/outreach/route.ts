// app/api/cron/outreach/route.ts
import { NextResponse } from "next/server";
import { runOutreachAgent } from "@/agents/outreach";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("authorization") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runOutreachAgent({
      searchQuery: process.env.OUTREACH_QUERY ?? "looking for web developer",
      portfolio: "https://shersial.com",
      minScore: 65,
      dailyLimit: 5,
      platforms: ["linkedin", "upwork"],
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
