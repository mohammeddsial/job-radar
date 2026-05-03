import { NextResponse } from "next/server";
import { scanJobs } from "@/lib/scanner";
import { sendTelegram } from "@/lib/telegram";
import { saveJobs } from "@/lib/store";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobs = await scanJobs();

    if (jobs.length === 0) {
      await sendTelegram(
        "🛰️ <b>Job Radar</b>\n\nNo matching jobs found today. Will try again tomorrow."
      );
      return NextResponse.json({ status: "no_jobs", count: 0 });
    }

    // Save to file so the /jobs page can display them
    saveJobs(jobs);

    const date = new Date().toLocaleDateString("en-PK", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    await sendTelegram(
      `🛰️ <b>Job Radar — ${date}</b>\n\nFound <b>${jobs.length}</b> remote positions matched to your profile 👇`
    );

    // Send each job as its own message
    for (const job of jobs.slice(0, 10)) {
      const tags = (job.skills || [])
        .slice(0, 4)
        .map((s) => `#${s.replace(/[^a-zA-Z0-9]/g, "")}`)
        .join(" ");

      const msg = [
        `<b>${job.title}</b>`,
        `🏢 ${job.company} — ${job.location}`,
        `📊 Match: <b>${job.match_score}%</b> | 📌 ${job.source}${job.posted ? ` • ${job.posted}` : ""}`,
        "",
        job.description,
        "",
        tags,
        "",
        job.url ? `🔗 <a href="${job.url}">Apply Now</a>` : "🔒 Private listing",
        "",
        `── Cold Message ──`,
        "",
        job.cold_message,
      ].join("\n");

      await sendTelegram(msg);
      await new Promise((r) => setTimeout(r, 600));
    }

    await sendTelegram(
      `✅ Done! ${jobs.length} jobs sent.\n\n🌐 View all: <a href="${process.env.NEXT_PUBLIC_URL || ""}/jobs">your job dashboard</a>`
    );

    return NextResponse.json({ status: "ok", count: jobs.length });
  } catch (err: any) {
    console.error(err);
    await sendTelegram(`❌ <b>Job Radar Error</b>\n\n${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
