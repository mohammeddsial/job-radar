// dashboard/AgentDashboard.jsx
// Drop this into your existing Next.js app as a page or component.
// Shows live status of all agents with recent activity feed.

"use client";
import { useState, useEffect } from "react";

const AGENTS = [
  {
    id: "job-scanner",
    name: "Job Scanner",
    icon: "🔍",
    color: "#1D9E75",
    bg: "#E1F5EE",
    description: "LinkedIn · Upwork · Indeed",
    existing: true,
  },
  {
    id: "outreach",
    name: "Outreach Agent",
    icon: "🤝",
    color: "#534AB7",
    bg: "#EEEDFE",
    description: "Lead discovery + messaging",
  },
  {
    id: "proposal-writer",
    name: "Proposal Writer",
    icon: "✍️",
    color: "#BA7517",
    bg: "#FAEEDA",
    description: "Claude-powered proposals",
  },
  {
    id: "social-marketing",
    name: "Social Agent",
    icon: "📢",
    color: "#993C1D",
    bg: "#FAECE7",
    description: "LinkedIn posts + replies",
  },
  {
    id: "portfolio-tracker",
    name: "Portfolio Tracker",
    icon: "📊",
    color: "#185FA5",
    bg: "#E6F1FB",
    description: "shersial.com SEO + backlinks",
  },
];

const MOCK_STATS = {
  "job-scanner":       { jobsFound: 142, topScore: 94, lastRun: "2h ago" },
  outreach:           { leadsFound: 23, messagesSent: 11, pendingApproval: 2 },
  "proposal-writer":  { drafted: 8, approved: 6, submitted: 5 },
  "social-marketing": { postsPublished: 12, commentsDrafted: 34, pendingApproval: 1 },
  "portfolio-tracker":{ position1: 3, newBacklinks: 7, pagespeed: 87 },
};

const MOCK_ACTIVITY = [
  { id: 1, agent: "portfolio-tracker", icon: "📈", text: '"web developer portfolio" moved to #4 on Google', time: "10m ago", type: "success" },
  { id: 2, agent: "outreach", icon: "⏳", text: 'Draft message to Sarah K. (CTO @ Acme) waiting approval', time: "22m ago", type: "pending" },
  { id: 3, agent: "proposal-writer", icon: "✅", text: 'Proposal approved & sent — "Full-stack SaaS developer"', time: "1h ago", type: "success" },
  { id: 4, agent: "social-marketing", icon: "💬", text: 'New comment on "Next.js 15 tips" — reply drafted', time: "2h ago", type: "pending" },
  { id: 5, agent: "job-scanner", icon: "⭐", text: 'High-score job found: "React + Tailwind dev" (score: 91)', time: "3h ago", type: "info" },
  { id: 6, agent: "portfolio-tracker", icon: "🔗", text: 'New backlink from devresources.io (DA 54)', time: "5h ago", type: "success" },
  { id: 7, agent: "outreach", icon: "↩️", text: 'Reply received from Marcus T. via LinkedIn', time: "6h ago", type: "success" },
  { id: 8, agent: "social-marketing", icon: "📝", text: 'Weekly content plan sent to Telegram for review', time: "8h ago", type: "info" },
];

const AGENT_COLORS = {
  "job-scanner": "#1D9E75",
  outreach: "#534AB7",
  "proposal-writer": "#BA7517",
  "social-marketing": "#993C1D",
  "portfolio-tracker": "#185FA5",
};

export default function AgentDashboard() {
  const [selected, setSelected] = useState(null);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 1200);
    return () => clearInterval(t);
  }, []);

  const typeColor = { success: "#0F6E56", pending: "#BA7517", info: "#185FA5" };
  const typeBg = { success: "#E1F5EE", pending: "#FAEEDA", info: "#E6F1FB" };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 780, margin: "0 auto", padding: "24px 16px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.5 }}>Agent Control Room</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>shersial.com · 5 agents active</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: pulse ? "#1D9E75" : "#9FE1CB",
            transition: "background 0.3s",
            boxShadow: pulse ? "0 0 0 3px #E1F5EE" : "none",
          }}/>
          <span style={{ fontSize: 12, color: "#1D9E75", fontWeight: 500 }}>All systems running</span>
        </div>
      </div>

      {/* Agent Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
        {AGENTS.map(agent => {
          const stats = MOCK_STATS[agent.id];
          const isSelected = selected === agent.id;
          const statEntries = Object.entries(stats).slice(0, 2);

          return (
            <button
              key={agent.id}
              onClick={() => setSelected(isSelected ? null : agent.id)}
              style={{
                background: isSelected ? agent.bg : "#fff",
                border: `1.5px solid ${isSelected ? agent.color : "#e5e5e5"}`,
                borderRadius: 12,
                padding: "14px 12px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
                position: "relative",
              }}
            >
              {agent.existing && (
                <span style={{
                  position: "absolute", top: 8, right: 8,
                  fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
                  color: agent.color, background: agent.bg,
                  padding: "2px 5px", borderRadius: 4,
                  border: `1px solid ${agent.color}30`,
                }}>EXISTING</span>
              )}
              <div style={{ fontSize: 22, marginBottom: 6 }}>{agent.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 }}>{agent.name}</div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>{agent.description}</div>
              {statEntries.map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: "#aaa", textTransform: "capitalize" }}>{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span style={{ fontWeight: 600, color: agent.color }}>{v}</span>
                </div>
              ))}
            </button>
          );
        })}
      </div>

      {/* Expanded agent detail */}
      {selected && (() => {
        const agent = AGENTS.find(a => a.id === selected);
        const stats = MOCK_STATS[selected];
        return (
          <div style={{
            background: agent.bg, border: `1px solid ${agent.color}40`,
            borderRadius: 12, padding: "16px 20px", marginBottom: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: agent.color }}>{agent.icon} {agent.name} — All Stats</span>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
              {Object.entries(stats).map(([k, v]) => (
                <div key={k} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2, textTransform: "capitalize" }}>
                    {k.replace(/([A-Z])/g, ' $1')}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: agent.color }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Activity feed */}
      <div style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Recent Activity</span>
          <span style={{ fontSize: 11, color: "#aaa" }}>Live feed</span>
        </div>
        {MOCK_ACTIVITY.map((item, i) => (
          <div key={item.id} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 16px",
            borderBottom: i < MOCK_ACTIVITY.length - 1 ? "1px solid #f5f5f5" : "none",
            transition: "background 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
            onMouseLeave={e => e.currentTarget.style.background = ""}
          >
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#333", lineHeight: 1.4 }}>{item.text}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: AGENT_COLORS[item.agent],
                  background: AGENTS.find(a => a.id === item.agent)?.bg,
                  padding: "1px 6px", borderRadius: 4,
                }}>
                  {AGENTS.find(a => a.id === item.agent)?.name}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  color: typeColor[item.type],
                  background: typeBg[item.type],
                  padding: "1px 6px", borderRadius: 4,
                }}>
                  {item.type}
                </span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "#bbb", flexShrink: 0, marginTop: 2 }}>{item.time}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p style={{ fontSize: 11, color: "#ccc", textAlign: "center", marginTop: 16 }}>
        Approvals via Telegram · Cron via Vercel · Data in Postgres + Redis
      </p>
    </div>
  );
}