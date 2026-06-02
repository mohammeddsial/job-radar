// app/api/cron/portfolio/route.ts
import { NextResponse } from "next/server";
import { runPortfolioTracker } from "@/agents/portfolio-tracker";

export async function GET(request: Request) {
  // Accept token from either header OR query parameter ?authorization=...
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("authorization");
  const headerToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const token = queryToken || headerToken;

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mySites = [
    "https://shersial.com",
    "https://www.warq.io/",
    "https://getdesign.io/"
  ];

  const results = [];
  for (const site of mySites) {
    try {
      const snapshot = await runPortfolioTracker(site);
      results.push({ site, status: "ok", snapshotId: snapshot.id });
    } catch (err: any) {
      console.error(`Failed to track ${site}:`, err.message);
      results.push({ site, status: "error", error: err.message });
    }
  }

  return NextResponse.json({ results });
}