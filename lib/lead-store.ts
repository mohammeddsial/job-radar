// lib/lead-store.ts
// File-based persistence for agency leads.
// Drop-in replacement — swap fs calls with Prisma/Drizzle when DB is wired up.

import fs from "fs";
import path from "path";
import os from "os";
import type { AgencyLead } from "../types";

const FILE = path.join(os.tmpdir(), "agency-leads.json");

// ── Read / Write ───────────────────────────────────────
function read(): AgencyLead[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    return JSON.parse(fs.readFileSync(FILE, "utf-8")) as AgencyLead[];
  } catch {
    return [];
  }
}

function write(leads: AgencyLead[]): void {
  fs.writeFileSync(FILE, JSON.stringify(leads, null, 2));
}

// ── Save (upsert by id) ────────────────────────────────
export function saveAgencyLeads(incoming: AgencyLead[]): void {
  const existing = read();
  const map = new Map(existing.map(l => [l.id, l]));
  for (const lead of incoming) map.set(lead.id, lead);
  write([...map.values()]);
}

// ── Load all ───────────────────────────────────────────
export function loadAgencyLeads(): AgencyLead[] {
  return read();
}

// ── Update a single lead ───────────────────────────────
export function updateLead(id: string, updates: Partial<AgencyLead>): void {
  const leads = read();
  const idx = leads.findIndex(l => l.id === id);
  if (idx >= 0) {
    leads[idx] = { ...leads[idx], ...updates };
    write(leads);
  }
}

// ── Get leads ready for email outreach ────────────────
export function getLeadsForEmail(): AgencyLead[] {
  return read().filter(
    l =>
      (l.status === "discovered" || l.status === "email-queued") &&
      !!l.contactEmail &&
      l.relevanceScore >= 60
  );
}

// ── Summary stats ──────────────────────────────────────
export function getLeadStats(): Record<string, number> {
  const leads = read();
  return leads.reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}
