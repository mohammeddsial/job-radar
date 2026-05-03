"use client";

import { useState, useEffect, useCallback } from "react";

interface Job {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  posted: string;
  description: string;
  skills: string[];
  match_score: number;
  cold_message: string;
}

const MY_SKILLS = [
  "webflow","react","next.js","wordpress","figma","tailwind","typescript",
  "javascript","html5","css3","shadcn","ui/ux","elementor","rtl","arabic"
];

const scoreColor = (s: number) =>
  s >= 80 ? "#22c55e" : s >= 60 ? "#e8c87a" : "#94a3b8";

const scoreBg = (s: number) =>
  s >= 80 ? "rgba(34,197,94,0.1)" : s >= 60 ? "rgba(232,200,122,0.1)" : "rgba(148,163,184,0.1)";

function SkillTag({ skill }: { skill: string }) {
  const matched = MY_SKILLS.some(
    (ms) => skill.toLowerCase().includes(ms) || ms.includes(skill.toLowerCase())
  );
  return (
    <span style={{
      fontSize: 10,
      padding: "3px 9px",
      borderRadius: 99,
      fontFamily: "'JetBrains Mono', monospace",
      background: matched ? "rgba(125,226,196,0.12)" : "rgba(255,255,255,0.04)",
      color: matched ? "#7de2c4" : "#64748b",
      border: `1px solid ${matched ? "rgba(125,226,196,0.25)" : "rgba(255,255,255,0.08)"}`,
    }}>
      {skill}
    </span>
  );
}

function JobCard({ job, index }: { job: Job; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(job.cold_message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      background: "var(--card, #131c2b)",
      border: `1px solid ${job.match_score >= 80 ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 12,
      overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      {/* Card header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: "18px 20px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#e8eaf0" }}>{job.title}</h3>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                background: scoreBg(job.match_score),
                color: scoreColor(job.match_score),
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {job.match_score}% match
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{job.company}</span>
              <span style={{ color: "#334155" }}>·</span>
              <span>{job.location}</span>
              {job.source && <>
                <span style={{ color: "#334155" }}>·</span>
                <span style={{ fontSize: 11, color: "#475569" }}>{job.source}</span>
              </>}
              {job.posted && <>
                <span style={{ color: "#334155" }}>·</span>
                <span style={{ fontSize: 11, color: "#475569" }}>{job.posted}</span>
              </>}
            </div>
          </div>
          <span style={{
            color: "#475569", fontSize: 16,
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
            flexShrink: 0,
          }}>▾</span>
        </div>

        {/* Skill tags */}
        {job.skills?.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
            {job.skills.slice(0, 6).map((s, i) => <SkillTag key={i} skill={s} />)}
          </div>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px" }}>
          {job.description && (
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 16px" }}>
              {job.description}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {job.url && (
              <a href={job.url} target="_blank" rel="noreferrer" style={{
                padding: "9px 18px", borderRadius: 8,
                background: "rgba(232,200,122,0.12)",
                color: "#e8c87a",
                border: "1px solid rgba(232,200,122,0.25)",
                fontSize: 12, fontWeight: 600,
                textDecoration: "none", fontFamily: "'JetBrains Mono', monospace",
              }}>
                Apply Now →
              </a>
            )}
          </div>

          {/* Cold message */}
          {job.cold_message && (
            <div style={{
              background: "rgba(125,226,196,0.04)",
              border: "1px solid rgba(125,226,196,0.15)",
              borderRadius: 8, padding: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: "#7de2c4",
                  fontFamily: "'JetBrains Mono', monospace",
                  textTransform: "uppercase", letterSpacing: 1,
                }}>
                  ✉ Cold Message — paste into LinkedIn
                </span>
                <button
                  onClick={copy}
                  style={{
                    padding: "4px 12px", borderRadius: 4,
                    background: copied ? "rgba(34,197,94,0.15)" : "rgba(125,226,196,0.12)",
                    color: copied ? "#22c55e" : "#7de2c4",
                    border: "none", fontSize: 11, cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {copied ? "✓ Copied!" : "Copy"}
                </button>
              </div>
              <p style={{
                fontSize: 13, lineHeight: 1.7,
                color: "#cbd5e1", margin: 0,
                whiteSpace: "pre-wrap",
              }}>
                {job.cold_message}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [loaded, setLoaded] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (data.jobs?.length > 0) {
        setJobs(data.jobs);
        setLastScanned(data.lastScanned);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/trigger", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.jobs) {
        setJobs(data.jobs);
        setLastScanned(new Date().toISOString());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const categories = ["all", "webflow", "react", "wordpress", "ui/ux"];

  const filtered = jobs.filter((j) => {
    if (filter === "all") return true;
    const text = `${j.title} ${j.skills?.join(" ")}`.toLowerCase();
    return text.includes(filter);
  });

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-PK", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#090d13" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #0f1521 0%, #090d13 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "28px 24px 24px",
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: scanning ? "#e8c87a" : "#22c55e",
              boxShadow: `0 0 8px ${scanning ? "#e8c87a" : "#22c55e"}`,
              animation: scanning ? "pulse 1s infinite" : "none",
            }} />
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: "#e8c87a",
              letterSpacing: 2, textTransform: "uppercase",
            }}>
              Job Radar · Zahid Sher Sial
            </span>
          </div>

          <h1 style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: "clamp(28px,5vw,42px)",
            fontWeight: 400, margin: "0 0 6px",
            color: "#e8eaf0",
          }}>
            Remote Jobs
          </h1>

          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
            Scans LinkedIn, Indeed, WeWorkRemotely & more · Auto-runs 10:00 AM PKT daily
            {lastScanned && (
              <span style={{ color: "#475569" }}> · Last scan: {formatDate(lastScanned)}</span>
            )}
          </p>

          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              padding: "11px 28px",
              background: scanning ? "rgba(232,200,122,0.08)" : "rgba(232,200,122,0.12)",
              color: "#e8c87a",
              border: "1px solid rgba(232,200,122,0.25)",
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: scanning ? "wait" : "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {scanning ? "⏳ Scanning..." : "⟳ Scan Now"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 24px 48px" }}>

        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 8, padding: "12px 16px",
            marginBottom: 20, fontSize: 13, color: "#f87171",
          }}>
            {error}
          </div>
        )}

        {/* Filter tabs */}
        {jobs.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                style={{
                  padding: "5px 14px", borderRadius: 99,
                  background: filter === cat ? "rgba(232,200,122,0.12)" : "transparent",
                  color: filter === cat ? "#e8c87a" : "#64748b",
                  border: `1px solid ${filter === cat ? "rgba(232,200,122,0.25)" : "rgba(255,255,255,0.08)"}`,
                  fontSize: 12, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  textTransform: "capitalize",
                }}
              >
                {cat === "all" ? `All (${jobs.length})` : cat}
              </button>
            ))}
          </div>
        )}

        {/* Jobs grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((job, i) => (
            <JobCard key={i} job={job} index={i} />
          ))}
        </div>

        {/* Empty state */}
        {loaded && jobs.length === 0 && !scanning && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 40, marginBottom: 12,
              color: "rgba(232,200,122,0.3)",
            }}>
              ⟳
            </div>
            <p style={{ fontSize: 14, color: "#475569", margin: "0 0 6px" }}>
              No jobs yet — click <strong style={{ color: "#e8c87a" }}>Scan Now</strong> to fetch today's listings
            </p>
            <p style={{ fontSize: 12, color: "#334155" }}>
              Or wait for the auto-scan at 10:00 AM PKT
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        * { box-sizing: border-box; }
        a:hover { opacity: 0.85; }
      `}</style>
    </div>
  );
}
