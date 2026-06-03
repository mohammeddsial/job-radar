// app/api/agency/route.ts
// REST endpoints for the two new agents:
//   GET  /api/agency?view=leads       — all agency leads (with stats)
//   GET  /api/agency?view=campaigns   — all email campaigns (with stats)
//   POST /api/agency                  — manual trigger / approval actions

import { NextResponse } from "next/server";
import { runLeadHunter } from "@/agents/agency-lead-hunter";
import {
  runEmailCampaigns,
  processFollowUps,
  handleCampaignApproval,
  generateEmailSequence,
  sendWeeklyEmailReport,
} from "@/agents/email-campaign";
import {
  loadAgencyLeads,
  getLeadStats,
  updateLead,
} from "@/lib/lead-store";
import {
  loadEmailCampaigns,
  getCampaignStats,
  loadCampaignById,
} from "@/lib/email-store";

function isAuthorized(req: Request): boolean {
  const secret = req.headers.get("x-agent-secret");
  return secret === process.env.AGENT_SECRET;
}

// ── GET — read data ────────────────────────────────────────────
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url  = new URL(req.url);
  const view = url.searchParams.get("view") || "leads";

  if (view === "leads") {
    const leads = loadAgencyLeads();
    const stats = getLeadStats();
    return NextResponse.json({
      leads: leads.sort((a, b) => b.relevanceScore - a.relevanceScore),
      stats,
      total: leads.length,
      withEmail: leads.filter(l => l.contactEmail).length,
    });
  }

  if (view === "campaigns") {
    const campaigns = loadEmailCampaigns();
    const stats     = getCampaignStats();
    return NextResponse.json({ campaigns, stats });
  }

  return NextResponse.json({ error: "Unknown view" }, { status: 400 });
}

// ── POST — trigger actions ─────────────────────────────────────
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, payload } = await req.json() as {
    action: string;
    payload: Record<string, unknown>;
  };

  try {
    switch (action) {
      // ── Run the lead hunter ──────────────────────────────────
      case "hunt-leads": {
        const leads = await runLeadHunter({
          minScore:   (payload.minScore  as number) ?? 60,
          dailyLimit: (payload.limit     as number) ?? 25,
          sources:    (payload.sources   as any)    ?? ["apollo", "product-hunt", "serp"],
          findEmails: (payload.findEmails as boolean) ?? true,
        });
        return NextResponse.json({ ok: true, found: leads.length });
      }

      // ── Start email campaigns for queued leads ──────────────
      case "start-campaigns": {
        await runEmailCampaigns({
          dailyLimit:      (payload.limit           as number)  ?? 10,
          requireApproval: (payload.requireApproval as boolean) ?? true,
        });
        return NextResponse.json({ ok: true });
      }

      // ── Process scheduled follow-ups ────────────────────────
      case "process-followups": {
        await processFollowUps();
        return NextResponse.json({ ok: true });
      }

      // ── Approve or reject a campaign (from Telegram) ────────
      case "approve-campaign": {
        const campaignId = payload.campaignId as string;
        const approved   = payload.approved   as boolean;
        await handleCampaignApproval(campaignId, approved);
        return NextResponse.json({ ok: true });
      }

      // ── Preview email sequence for a lead ───────────────────
      case "preview-sequence": {
        const leadId = payload.leadId as string;
        const leads  = loadAgencyLeads();
        const lead   = leads.find(l => l.id === leadId);
        if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

        const sequence = await generateEmailSequence(lead);
        return NextResponse.json({ ok: true, sequence });
      }

      // ── Update a lead's status manually ─────────────────────
      case "update-lead": {
        const { leadId, ...updates } = payload as { leadId: string; [key: string]: unknown };
        updateLead(leadId, updates as any);
        return NextResponse.json({ ok: true });
      }

      // ── Get a specific campaign ─────────────────────────────
      case "get-campaign": {
        const campaign = loadCampaignById(payload.campaignId as string);
        if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ ok: true, campaign });
      }

      // ── Weekly report ────────────────────────────────────────
      case "weekly-report": {
        await sendWeeklyEmailReport();
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[api/agency] ${action} error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
