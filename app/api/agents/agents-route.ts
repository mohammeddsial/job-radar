// api/agents/route.ts  (Next.js App Router)
// Single entry-point for all agent triggers.
// Deploy these as Next.js API routes in your existing project.
//
// POST /api/agents          — trigger an agent run
// POST /api/telegram/webhook — receive Telegram callback queries
// GET  /api/agents/status    — dashboard data

import { NextRequest, NextResponse } from "next/server";
import { runOutreachAgent } from "@/agents/outreach";
import { runProposalWriter, regenerateWithFeedback, processJobQueue } from "../../../agents/proposal-writer";
import { schedulePost, processNewComments, sendWeeklyContentPlan } from "../../../agents/social-marketing";
import { runPortfolioTracker, compareWithCompetitors } from "../../../agents/portfolio-tracker";
import { handleWebhookUpdate } from "../../../telegram/bot";
import type { JobLead } from "../../../types";

// ── Auth middleware (simple shared secret) ─────────────
function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return secret === process.env.AGENT_SECRET;
}

// ── POST /api/agents ───────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { agent, action, payload } = body as {
    agent: string;
    action: string;
    payload: Record<string, unknown>;
  };

  try {
    switch (agent) {
      // ── Outreach Agent ─────────────────────────────
      case "outreach": {
        if (action === "run") {
          await runOutreachAgent({
            searchQuery: (payload.query as string) ?? "hiring web developer",
            portfolio: "https://shersial.com",
            minScore: (payload.minScore as number) ?? 65,
            dailyLimit: (payload.dailyLimit as number) ?? 5,
            platforms: (payload.platforms as Array<"linkedin" | "upwork">) ?? ["linkedin", "upwork"],
          });
          return NextResponse.json({ ok: true, message: "Outreach agent started" });
        }
        break;
      }

      // ── Proposal Writer ────────────────────────────
      case "proposal-writer": {
        if (action === "write") {
          const job = payload.job as JobLead;
          const proposal = await runProposalWriter(job, {
            jobLeadId: job.id,
            style: (payload.style as "cover-letter" | "upwork-proposal" | "email-pitch") ?? "cover-letter",
            tone: (payload.tone as "formal" | "conversational" | "enthusiastic") ?? "conversational",
            highlights: (payload.highlights as string[]) ?? [],
            wordLimit: payload.wordLimit as number | undefined,
          });
          return NextResponse.json({ ok: true, proposal });
        }

        if (action === "process-queue") {
          const jobs = payload.jobs as JobLead[];
          await processJobQueue(jobs, {
            style: "cover-letter",
            tone: "conversational",
            highlights: [],
          });
          return NextResponse.json({ ok: true, message: `Processing ${jobs.length} jobs` });
        }

        if (action === "regenerate") {
          const improved = await regenerateWithFeedback(
            payload.proposal as Parameters<typeof regenerateWithFeedback>[0],
            payload.job as JobLead,
            payload.feedback as string
          );
          return NextResponse.json({ ok: true, proposal: improved });
        }
        break;
      }

      // ── Social Marketing ───────────────────────────
      case "social-marketing": {
        if (action === "schedule-post") {
          const post = await schedulePost(
            new Date(payload.scheduledAt as string),
            payload.topicIndex as number | undefined
          );
          return NextResponse.json({ ok: true, post });
        }

        if (action === "process-comments") {
          const replies = await processNewComments(
            payload.postUrn as string,
            payload.postContent as string,
            new Set(payload.knownCommentIds as string[])
          );
          return NextResponse.json({ ok: true, replies });
        }

        if (action === "weekly-plan") {
          await sendWeeklyContentPlan();
          return NextResponse.json({ ok: true, message: "Weekly plan sent to Telegram" });
        }
        break;
      }

      // ── Portfolio Tracker ──────────────────────────
      case "portfolio-tracker": {
        if (action === "run") {
          const snapshot = await runPortfolioTracker(
            payload.previousSnapshot as Parameters<typeof runPortfolioTracker>[0]
          );
          return NextResponse.json({ ok: true, snapshot });
        }

        if (action === "compare-competitors") {
          await compareWithCompetitors(payload.competitorUrls as string[]);
          return NextResponse.json({ ok: true });
        }
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
    }

    return NextResponse.json({ error: `Unknown action: ${action} for ${agent}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[api/agents] ${agent}/${action} error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── GET /api/agents/status ─────────────────────────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Fetch summary stats from DB — replace stubs with real queries
  return NextResponse.json({
    agents: {
      "job-scanner": { status: "active", lastRun: new Date().toISOString() },
      outreach: { status: "active", leadsThisWeek: 0, messagesSent: 0 },
      "proposal-writer": { status: "active", proposalsThisWeek: 0, approved: 0 },
      "social-marketing": { status: "active", postsScheduled: 0, repliesDrafted: 0 },
      "portfolio-tracker": { status: "active", lastSnapshot: null },
    },
  });
}