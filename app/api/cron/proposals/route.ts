// app/api/cron/proposals/route.ts
import { NextResponse } from "next/server";
import { loadJobs } from "@/lib/store";
import { generateProposal } from "@/agents/proposal-writer";
import { saveProposal, getProposals } from "@/lib/queue";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = loadJobs();
  if (!data || !data.jobs.length) {
    return NextResponse.json({ message: "No jobs found" });
  }

  const highScoreJobs = data.jobs.filter(job => job.match_score >= 80);
  const existingProposals = await getProposals();
  const existingJobIds = new Set(existingProposals.map(p => p.job_id));

  let generated = 0;
  for (const job of highScoreJobs) {
    if (existingJobIds.has(job.url)) continue;

    const proposalText = await generateProposal(job);
    await saveProposal({
      job_id: job.url,
      job_title: job.title,
      company: job.company,
      raw_job_data: job,
      content: proposalText,
      status: "draft",
    });
    generated++;
  }

  return NextResponse.json({ generated, total_high_score: highScoreJobs.length });
}