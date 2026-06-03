// app/api/cron/agency-leads/route.ts
// Runs the Global Agency Lead Hunter every weekday morning.
// Vercel Cron: "0 6 * * 1-5"  (6am Mon–Fri)

import { NextResponse } from "next/server";
import { runLeadHunter } from "@/agents/agency-lead-hunter";

export const maxDuration = 60;

export async function GET(request: Request) {
  // Accept token from header OR query string (for easy testing in browser)
  const url = new URL(request.url);
  const queryToken  = url.searchParams.get("authorization");
  const headerToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const token = queryToken || headerToken;

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leads = await runLeadHunter({
      minScore:     60,
      dailyLimit:   25,
      sources:      ["apollo", "product-hunt", "serp"],
      findEmails:   true,
    });

    const withEmail = leads.filter(l => l.contactEmail).length;

    return NextResponse.json({
      ok: true,
      total:      leads.length,
      withEmail,
      topScore:   leads[0]?.relevanceScore || 0,
      topCompany: leads[0]?.company || null,
    });
  } catch (err: any) {
    console.error("[cron/agency-leads]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
