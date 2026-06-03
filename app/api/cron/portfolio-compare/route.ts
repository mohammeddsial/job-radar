// app/api/cron/portfolio-compare/route.ts
import { NextResponse } from "next/server";
import { compareWithCompetitors } from "@/agents/portfolio-tracker";

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
    await compareWithCompetitors([
      "https://studio.co",
      "https://unfold.co",
      "https://webdevchoice.com",
    ]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
