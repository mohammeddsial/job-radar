// api/cron/routes.ts
// Each export maps to one GET route in your Next.js app.
// Copy each function into its own file: app/api/cron/[name]/route.ts
//
// All routes validate the Vercel cron secret before running.

import { NextRequest, NextResponse } from "next/server";
import { runOutreachAgent } from "@/agents/outreach";
import { processJobQueue } from "@/agents/proposal-writer";
import { schedulePost, processNewComments, sendWeeklyContentPlan } from "@/agents/social-marketing";
import {
  runPortfolioTracker,
  compareWithCompetitors,
} from "@/agents/portfolio-tracker";

function isVercelCron(req: NextRequest): boolean {
  // Vercel sets this header on cron invocations
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

// ── /api/cron/outreach ───────────────────────────────────
export async function GET_outreach(req: NextRequest): Promise<NextResponse> {
  if (!isVercelCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await runOutreachAgent({
    searchQuery: process.env.OUTREACH_QUERY ?? "looking for web developer",
    portfolio: "https://shersial.com",
    minScore: 65,
    dailyLimit: 5,
    platforms: ["linkedin", "upwork"],
  });
  return NextResponse.json({ ok: true });
}

// ── /api/cron/proposals ──────────────────────────────────
export async function GET_proposals(req: NextRequest): Promise<NextResponse> {
  if (!isVercelCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Fetch top unprocessed jobs from DB (replace with real query)
  const jobs = await fetchPendingJobs();
  await processJobQueue(jobs, { style: "cover-letter", tone: "conversational", highlights: [] });
  return NextResponse.json({ ok: true, count: jobs.length });
}

// ── /api/cron/social-post ────────────────────────────────
export async function GET_socialPost(req: NextRequest): Promise<NextResponse> {
  if (!isVercelCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Schedule for 10am today
  const scheduledAt = new Date();
  scheduledAt.setHours(10, 0, 0, 0);
  await schedulePost(scheduledAt);
  return NextResponse.json({ ok: true });
}

// ── /api/cron/social-comments ────────────────────────────
export async function GET_socialComments(req: NextRequest): Promise<NextResponse> {
  if (!isVercelCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Fetch recent published posts from DB (replace with real query)
  const posts = await fetchRecentPosts();
  let totalReplies = 0;
  for (const post of posts) {
    const knownIds = await fetchKnownCommentIds(post.linkedInUrn);
    const replies = await processNewComments(post.linkedInUrn, post.content, knownIds);
    totalReplies += replies.length;
  }
  return NextResponse.json({ ok: true, repliesDrafted: totalReplies });
}

// ── /api/cron/weekly-content-plan ───────────────────────
export async function GET_weeklyContentPlan(req: NextRequest): Promise<NextResponse> {
  if (!isVercelCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await sendWeeklyContentPlan();
  return NextResponse.json({ ok: true });
}

// ── /api/cron/portfolio ──────────────────────────────────
export async function GET_portfolio(req: NextRequest): Promise<NextResponse> {
  if (!isVercelCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const previous = await fetchLatestPortfolioSnapshot();
  const snapshot = await runPortfolioTracker(previous);
  return NextResponse.json({ ok: true, snapshotId: snapshot.id });
}

// ── /api/cron/portfolio-compare ─────────────────────────
export async function GET_portfolioCompare(req: NextRequest): Promise<NextResponse> {
  if (!isVercelCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await compareWithCompetitors([
    // Replace with your actual competitors
    "https://competitor1.com",
    "https://competitor2.com",
  ]);
  return NextResponse.json({ ok: true });
}

// ── DB stubs (replace with your Prisma/Drizzle calls) ───

import type { JobLead, PortfolioSnapshot } from "../../../types";

async function fetchPendingJobs(): Promise<JobLead[]> {
  // SELECT * FROM job_leads WHERE status = 'new' AND score >= 70 ORDER BY score DESC LIMIT 5
  return [];
}

async function fetchRecentPosts(): Promise<Array<{ linkedInUrn: string; content: string }>> {
  // SELECT linkedin_urn, content FROM social_posts WHERE status = 'published' AND published_at > NOW() - INTERVAL '7 days'
  return [];
}

async function fetchKnownCommentIds(postUrn: string): Promise<Set<string>> {
  // SELECT comment_id FROM social_replies WHERE post_urn = $1
  return new Set();
}

async function fetchLatestPortfolioSnapshot(): Promise<PortfolioSnapshot | null> {
  // SELECT * FROM portfolio_snapshots ORDER BY captured_at DESC LIMIT 1
  return null;
}