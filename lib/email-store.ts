// lib/email-store.ts
// Persists email campaigns and tracks engagement.
// All timestamps are ISO strings for JSON-safe serialisation.

import fs from "fs";
import path from "path";
import os from "os";
import type { EmailCampaign, EmailCampaignStep, EmailTrackingEvent } from "../types";

const CAMPAIGNS_FILE = path.join(os.tmpdir(), "email-campaigns.json");
const EVENTS_FILE    = path.join(os.tmpdir(), "email-events.json");

// ── Campaigns ──────────────────────────────────────────
function readCampaigns(): EmailCampaign[] {
  try {
    if (!fs.existsSync(CAMPAIGNS_FILE)) return [];
    return JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, "utf-8"));
  } catch { return []; }
}

function writeCampaigns(campaigns: EmailCampaign[]): void {
  fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
}

export function saveEmailCampaign(campaign: EmailCampaign): void {
  const campaigns = readCampaigns();
  const idx = campaigns.findIndex(c => c.id === campaign.id);
  if (idx >= 0) campaigns[idx] = campaign;
  else campaigns.push(campaign);
  writeCampaigns(campaigns);
}

export function loadEmailCampaigns(): EmailCampaign[] {
  return readCampaigns();
}

export function loadCampaignById(id: string): EmailCampaign | null {
  return readCampaigns().find(c => c.id === id) || null;
}

export function updateCampaignStep(
  campaignId: string,
  stepNumber: number,
  updates: Partial<EmailCampaignStep>
): void {
  const campaigns = readCampaigns();
  const campaign = campaigns.find(c => c.id === campaignId);
  if (!campaign) return;
  const step = campaign.steps.find(s => s.stepNumber === stepNumber);
  if (step) Object.assign(step, updates);
  writeCampaigns(campaigns);
}

// ── Follow-up queue ────────────────────────────────────
// Returns campaigns where the next pending step is due NOW
export function getPendingFollowUps(): Array<{
  campaign: EmailCampaign;
  step: EmailCampaignStep;
}> {
  const now = new Date();
  const result: Array<{ campaign: EmailCampaign; step: EmailCampaignStep }> = [];

  for (const campaign of readCampaigns()) {
    if (campaign.status !== "active") continue;
    const nextStep = campaign.steps.find(
      s => s.status === "pending" && new Date(s.scheduledAt) <= now
    );
    if (nextStep) result.push({ campaign, step: nextStep });
  }

  return result;
}

// ── Events (opens, clicks, replies) ───────────────────
function readEvents(): EmailTrackingEvent[] {
  try {
    if (!fs.existsSync(EVENTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf-8"));
  } catch { return []; }
}

export function saveTrackingEvent(event: EmailTrackingEvent): void {
  const events = readEvents();
  events.push(event);
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

export function loadTrackingEvents(): EmailTrackingEvent[] {
  return readEvents();
}

// ── Campaign stats ─────────────────────────────────────
export function getCampaignStats(): {
  total: number;
  active: number;
  opened: number;
  replied: number;
  completed: number;
} {
  const campaigns = readCampaigns();
  return {
    total:     campaigns.length,
    active:    campaigns.filter(c => c.status === "active").length,
    opened:    campaigns.filter(c => c.steps.some(s => s.openedAt)).length,
    replied:   campaigns.filter(c => c.steps.some(s => s.replied)).length,
    completed: campaigns.filter(c => c.status === "completed").length,
  };
}
