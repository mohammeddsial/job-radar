"use client";
// app/agency/page.tsx
// Live dashboard for the two new agents:
//   - Global Agency Lead Hunter results
//   - Email Campaign statuses & engagement

import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────
interface AgencyLead {
  id: string;
  company: string;
  website: string;
  industry: string;
  country: string;
  region: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  source: string;
  painPoints: string[];
  recommendedService?: string;
  relevanceScore: number;
  status: string;
  notes?: string;
  createdAt: string;
  lastContactedAt?: string;
}

interface EmailStep {
  stepNumber: number;
  subject: string;
  scheduledAt: string;
  sentAt?: string;
  openedAt?: string;
  replied: boolean;
  status: string;
}

interface EmailCampaign {
  id: string;
  companyName: string;
  contactEmail: string;
  campaignType: string;
  steps: EmailStep[];
  currentStep: number;
  status: string;
  startedAt: string;
}

// ── Colours ──────────────────────────────────────────────────────
const scoreColor = (s: number) =>
  s >= 80 ? "#22c55e" : s >= 65 ? "#e8c87a" : "#94a3b8";

const statusBadge: Record<string, { bg: string; color: string; label: string }> = {
  discovered:     { bg: "rgba(148,163,184,.12)", color: "#94a3b8",  label: "New"           },
  "email-queued": { bg: "rgba(232,200,122,.12)", color: "#e8c87a",  label: "Queued"        },
  "email-sent":   { bg: "rgba(59,130,246,.12)",  color: "#60a5fa",  label: "Emailed"       },
  opened:         { bg: "rgba(168,85,247,.12)",  color: "#c084fc",  label: "Opened"        },
  clicked:        { bg: "rgba(251,146,60,.12)",  color: "#fb923c",  label: "Clicked"       },
  replied:        { bg: "rgba(34,197,94,.12)",   color: "#22c55e",  label: "Replied 🎉"    },
  "meeting-booked":{ bg:"rgba(34,197,94,.2)",   color: "#4ade80",  label: "Meeting!"      },
  lost:           { bg: "rgba(239,68,68,.08)",   color: "#f87171",  label: "Lost"          },
};

const sourceIcon: Record<string, string> = {
  apollo:         "🔵",
  "product-hunt": "🦁",
  "google-serp":  "🔍",
  crunchbase:     "💰",
  linkedin:       "💼",
  manual:         "✍️",
};

// ── Stat card ────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "#e8c87a" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "#131c2b",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase",
        letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "'DM Serif Display', serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Lead card ────────────────────────────────────────────────────
function LeadCard({ lead, onAction }: { lead: AgencyLead; onAction: (id: string, action: string) => void }) {
  const [open, setOpen] = useState(false);
  const badge = statusBadge[lead.status] || statusBadge.discovered;

  return (
    <div style={{
      background: "#0f1620",
      border: `1px solid ${lead.relevanceScore >= 80 ? "rgba(34,197,94,.2)" : "rgba(255,255,255,.06)"}`,
      borderRadius: 10, overflow: "hidden",
    }}>
      {/* Row */}
      <div onClick={() => setOpen(!open)} style={{ padding: "14px 18px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 18 }}>{sourceIcon[lead.source] || "🌐"}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#e8eaf0" }}>{lead.company}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
              background: `rgba(34,197,94,.1)`, color: scoreColor(lead.relevanceScore),
              fontFamily: "'JetBrains Mono', monospace" }}>
              {lead.relevanceScore}/100
            </span>
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4,
              background: badge.bg, color: badge.color }}>{badge.label}</span>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {lead.contactName && <span style={{ color: "#94a3b8" }}>{lead.contactName} · </span>}
            {lead.industry} · {lead.country || lead.region}
            {lead.recommendedService && <span style={{ color: "#7de2c4" }}> · {lead.recommendedService}</span>}
          </div>
        </div>

        <span style={{ color: "#334155", fontSize: 14,
          transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
      </div>

      {/* Expanded */}
      {open && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.05)", padding: "14px 18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {lead.contactEmail && (
              <div style={{ fontSize: 12, color: "#7de2c4" }}>📧 {lead.contactEmail}</div>
            )}
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: "#60a5fa" }}>🔗 {lead.website}</a>
            )}
          </div>

          {lead.painPoints.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 5,
                fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>Pain points</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {lead.painPoints.map((p, i) => (
                  <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4,
                    background: "rgba(239,68,68,.08)", color: "#fca5a5",
                    border: "1px solid rgba(239,68,68,.15)" }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {lead.notes && (
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12,
              background: "rgba(125,226,196,.04)", padding: "8px 10px", borderRadius: 6,
              borderLeft: "2px solid rgba(125,226,196,.3)" }}>
              💡 {lead.notes}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {!lead.contactEmail && (
              <button onClick={() => onAction(lead.id, "find-email")} style={btnStyle("#60a5fa")}>
                🔍 Find Email
              </button>
            )}
            {lead.contactEmail && lead.status === "discovered" && (
              <button onClick={() => onAction(lead.id, "queue-email")} style={btnStyle("#7de2c4")}>
                ✉️ Queue Email
              </button>
            )}
            <button onClick={() => onAction(lead.id, "mark-lost")} style={btnStyle("#f87171")}>
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(color: string) {
  return {
    padding: "6px 14px", borderRadius: 6, border: `1px solid ${color}40`,
    background: `${color}12`, color, fontSize: 11, cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  } as React.CSSProperties;
}

// ── Campaign row ─────────────────────────────────────────────────
function CampaignRow({ c }: { c: EmailCampaign }) {
  const stepColors: Record<string, string> = {
    pending: "#334155", sent: "#60a5fa", opened: "#c084fc",
    clicked: "#fb923c", replied: "#22c55e", skipped: "#475569", bounced: "#f87171",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0",
      borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#e8eaf0", fontWeight: 500 }}>{c.companyName}</div>
        <div style={{ fontSize: 11, color: "#475569" }}>{c.contactEmail}</div>
      </div>
      {/* Step indicators */}
      <div style={{ display: "flex", gap: 4 }}>
        {c.steps.map(s => (
          <div key={s.stepNumber} title={`Step ${s.stepNumber}: ${s.status}`} style={{
            width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 10, fontWeight: 700,
            background: `${stepColors[s.status] || "#334155"}20`,
            color: stepColors[s.status] || "#334155",
            border: `1px solid ${stepColors[s.status] || "#334155"}40`,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {s.stepNumber}
          </div>
        ))}
      </div>
      <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4,
        background: c.status === "active" ? "rgba(34,197,94,.1)" : "rgba(148,163,184,.1)",
        color: c.status === "active" ? "#22c55e" : "#94a3b8" }}>
        {c.status}
      </span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export default function AgencyPage() {
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [camStats, setCamStats] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<"leads" | "campaigns">("leads");
  const [filter, setFilter] = useState("all");
  const [hunting, setHunting] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [toast, setToast] = useState("");
  const SECRET = process.env.NEXT_PUBLIC_AGENT_SECRET || "";

  const headers = { "Content-Type": "application/json", "x-agent-secret": SECRET };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      const [lr, cr] = await Promise.all([
        fetch("/api/agency?view=leads",     { headers }),
        fetch("/api/agency?view=campaigns", { headers }),
      ]);
      const ld = await lr.json();
      const cd = await cr.json();
      setLeads(ld.leads     || []);
      setStats(ld.stats     || {});
      setCampaigns(cd.campaigns || []);
      setCamStats(cd.stats     || {});
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const huntLeads = async () => {
    setHunting(true);
    try {
      const res = await fetch("/api/agency", {
        method: "POST", headers,
        body: JSON.stringify({ action: "hunt-leads", payload: { minScore: 60, limit: 25 } }),
      });
      const d = await res.json();
      showToast(`✅ Found ${d.found} new leads!`);
      await loadData();
    } catch { showToast("❌ Hunt failed"); }
    setHunting(false);
  };

  const startCampaigns = async () => {
    setEmailing(true);
    try {
      await fetch("/api/agency", {
        method: "POST", headers,
        body: JSON.stringify({ action: "start-campaigns", payload: { limit: 10 } }),
      });
      showToast("✅ Email campaigns queued for Telegram approval");
      await loadData();
    } catch { showToast("❌ Failed"); }
    setEmailing(false);
  };

  const handleLeadAction = async (id: string, action: string) => {
    const status = action === "queue-email" ? "email-queued" : action === "mark-lost" ? "lost" : undefined;
    if (!status) return;
    await fetch("/api/agency", {
      method: "POST", headers,
      body: JSON.stringify({ action: "update-lead", payload: { leadId: id, status } }),
    });
    await loadData();
  };

  const filters = [
    { key: "all",           label: `All (${leads.length})` },
    { key: "discovered",    label: `New (${stats.discovered || 0})` },
    { key: "email-queued",  label: `Queued (${stats["email-queued"] || 0})` },
    { key: "email-sent",    label: `Emailed (${stats["email-sent"] || 0})` },
    { key: "replied",       label: `Replied (${stats.replied || 0})` },
  ];

  const filtered = leads.filter(l => filter === "all" || l.status === filter);

  return (
    <div style={{ minHeight: "100vh", background: "#090d13", color: "#e8eaf0" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999,
          background: "#131c2b", border: "1px solid rgba(34,197,94,.3)",
          padding: "12px 20px", borderRadius: 8, fontSize: 13, color: "#22c55e" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(180deg,#0f1521 0%,#090d13 100%)",
        borderBottom: "1px solid rgba(255,255,255,.07)", padding: "28px 24px 20px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%",
                  background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                  color: "#e8c87a", letterSpacing: 2, textTransform: "uppercase" }}>
                  Warq Agency · Global Lead System
                </span>
              </div>
              <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 32,
                fontWeight: 400, margin: 0, color: "#e8eaf0" }}>Agency Pipeline</h1>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={huntLeads} disabled={hunting} style={{
                padding: "11px 22px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: hunting ? "rgba(34,197,94,.05)" : "rgba(34,197,94,.12)",
                color: "#22c55e", border: "1px solid rgba(34,197,94,.25)", cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace",
              }}>
                {hunting ? "⏳ Hunting..." : "🌍 Hunt Leads"}
              </button>
              <button onClick={startCampaigns} disabled={emailing} style={{
                padding: "11px 22px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: emailing ? "rgba(232,200,122,.05)" : "rgba(232,200,122,.12)",
                color: "#e8c87a", border: "1px solid rgba(232,200,122,.25)", cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace",
              }}>
                {emailing ? "⏳ Queuing..." : "✉️ Start Campaigns"}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
            gap: 10, marginTop: 20 }}>
            <StatCard label="Total Leads"   value={leads.length}             color="#e8c87a" />
            <StatCard label="With Email"    value={leads.filter(l=>l.contactEmail).length} color="#7de2c4" />
            <StatCard label="Campaigns"     value={camStats.total    || 0}   color="#60a5fa" />
            <StatCard label="Opened"        value={camStats.opened   || 0}   color="#c084fc" />
            <StatCard label="Replied"       value={camStats.replied  || 0}   color="#22c55e"
              sub={camStats.total ? `${Math.round((camStats.replied||0)/camStats.total*100)}% reply rate` : ""} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 24px 0" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {(["leads","campaigns"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 20px", borderRadius: 6, fontSize: 13, cursor: "pointer",
              background: tab === t ? "rgba(232,200,122,.12)" : "transparent",
              color: tab === t ? "#e8c87a" : "#475569",
              border: `1px solid ${tab === t ? "rgba(232,200,122,.25)" : "rgba(255,255,255,.06)"}`,
              fontFamily: "'JetBrains Mono',monospace", textTransform: "capitalize",
            }}>{t}</button>
          ))}
        </div>

        {/* LEADS TAB */}
        {tab === "leads" && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {filters.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  padding: "4px 12px", borderRadius: 99, fontSize: 11, cursor: "pointer",
                  background: filter === f.key ? "rgba(232,200,122,.1)" : "transparent",
                  color: filter === f.key ? "#e8c87a" : "#475569",
                  border: `1px solid ${filter === f.key ? "rgba(232,200,122,.2)" : "rgba(255,255,255,.06)"}`,
                  fontFamily: "'JetBrains Mono',monospace",
                }}>{f.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 48 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
                  <div style={{ fontSize: 40 }}>🌍</div>
                  <p style={{ marginTop: 12 }}>No leads yet — click <strong style={{ color: "#22c55e" }}>Hunt Leads</strong></p>
                </div>
              ) : filtered.map(l => (
                <LeadCard key={l.id} lead={l} onAction={handleLeadAction} />
              ))}
            </div>
          </>
        )}

        {/* CAMPAIGNS TAB */}
        {tab === "campaigns" && (
          <div style={{ paddingBottom: 48 }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 12,
              fontFamily: "'JetBrains Mono',monospace" }}>
              Step colours: 1=sent 2=follow-up 3=breakup · purple=opened · orange=clicked · green=replied
            </div>
            {campaigns.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
                <div style={{ fontSize: 40 }}>✉️</div>
                <p style={{ marginTop: 12 }}>No campaigns yet — hunt leads first, then start campaigns</p>
              </div>
            ) : (
              <div style={{ background: "#0f1620", border: "1px solid rgba(255,255,255,.06)",
                borderRadius: 10, padding: "0 18px" }}>
                {campaigns.map(c => <CampaignRow key={c.id} c={c} />)}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`* { box-sizing:border-box; } a { color:inherit; }`}</style>
    </div>
  );
}
