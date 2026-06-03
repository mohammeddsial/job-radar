// app/api/cron/email-campaigns/route.ts
// Two responsibilities in one route:
//   1. Start new campaigns for leads that have been approved/queued  (action=send)
//   2. Process scheduled follow-up emails (action=followups)
//
// Vercel Cron:
//   "0 7 * * 1-5"   → send new campaigns (7am Mon–Fri, after lead scan at 6am)
//   "0 */3 * * *"   → process follow-ups (every 3 hours)

import { NextResponse } from "next/server";
import { runEmailCampaigns, processFollowUps, sendWeeklyEmailReport } from "@/agents/email-campaign";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url    = new URL(request.url);
  const token  = url.searchParams.get("authorization") ||
                 request.headers.get("authorization")?.replace("Bearer ", "");
  const action = url.searchParams.get("action") || "followups";

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (action === "send") {
      // Start fresh campaigns for leads that are queued
      await runEmailCampaigns({
        dailyLimit:      10,
        requireApproval: true, // set false to skip Telegram approval
      });
      return NextResponse.json({ ok: true, action: "send" });
    }

    if (action === "followups") {
      // Send scheduled follow-up emails (Day 3 & Day 7)
      await processFollowUps();
      return NextResponse.json({ ok: true, action: "followups" });
    }

    if (action === "weekly-report") {
      await sendWeeklyEmailReport();
      return NextResponse.json({ ok: true, action: "weekly-report" });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("[cron/email-campaigns]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
