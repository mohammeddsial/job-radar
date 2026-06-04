// app/api/cron/agency-leads/route.ts
import { NextResponse } from "next/server";
import { runLeadHunter } from "@/agents/agency-lead-hunter";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url   = new URL(request.url);
  const token = url.searchParams.get("authorization") ||
                request.headers.get("authorization")?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leads = await runLeadHunter({
      minScore:   60,
      dailyLimit: 30,
      sources:    ["growthtalent", "apollo", "product-hunt", "serp"],
      findEmails: true,
    });

    return NextResponse.json({
      ok:         true,
      total:      leads.length,
      withEmail:  leads.filter(l => l.contactEmail).length,
      topScore:   leads[0]?.relevanceScore || 0,
      topCompany: leads[0]?.company || null,
      bySource: {
        growthtalent: leads.filter(l => l.source === "growthtalent").length,
        apollo:       leads.filter(l => l.source === "apollo").length,
        productHunt:  leads.filter(l => l.source === "product-hunt").length,
        serp:         leads.filter(l => l.source === "google-serp").length,
      },
    });
  } catch (err: any) {
    console.error("[cron/agency-leads]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
