import { NextResponse } from "next/server";
import { scanJobs } from "@/lib/scanner";
import { saveJobs } from "@/lib/store";
import { sendTelegram } from "@/lib/telegram";

export const maxDuration = 60;

export async function POST() {
  try {
    const jobs = await scanJobs();
    if (jobs.length > 0) {
      saveJobs(jobs);
      await sendTelegram(
        `🛰️ <b>Manual Scan Complete</b>\n\nFound <b>${jobs.length}</b> matching remote jobs — check your dashboard!`
      );
    }
    return NextResponse.json({ status: "ok", count: jobs.length, jobs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
