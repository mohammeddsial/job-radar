// app/api/trigger/route.ts
import { NextResponse } from "next/server";
import { scanJobs } from "@/lib/scanner";
import { saveJobs } from "@/lib/store";
import { sendTelegram } from "@/lib/telegram";

export const maxDuration = 60;

export async function POST() {
  try {
    const jobs = await scanJobs();

    // Always save – even if empty, so old data is cleared
    saveJobs(jobs);

    if (jobs.length > 0) {
      await sendTelegram(
        `🛰️ <b>Manual Scan Complete</b>\n\nFound <b>${jobs.length}</b> matching remote jobs — check your dashboard!`
      );
    } else {
      await sendTelegram(
        `🛰️ <b>Manual Scan Complete</b>\n\nNo matching jobs found this time.`
      );
    }

    // Always return the jobs array – frontend will update immediately
    return NextResponse.json({ status: "ok", count: jobs.length, jobs });
  } catch (err: any) {
    console.error("Scan trigger error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}