// agents/portfolio-tracker/index.ts – multi‑site version
import type { PortfolioSnapshot, KeywordRanking, BacklinkRecord, PortfolioAlert } from "../../types";
import { sendNotification } from "../../telegram/bot";
import { publishEvent } from "../../lib/queue";

// Helper to extract Google Search Console site name from URL
function getGoogleSiteFromUrl(url: string): string {
  const domain = new URL(url).hostname;
  return `sc-domain:${domain}`;
}

// ── Groq AI helper ─────────────────────────────────────
async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.5 }),
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// ── 1. Keyword Rankings via Google Search Console ────────
async function getGoogleAccessToken(): Promise<string> {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token ?? "";
}

export async function fetchKeywordRankings(targetUrl: string, startDate: string, endDate: string, limit = 50): Promise<KeywordRanking[]> {
  const token = await getGoogleAccessToken();
  const googleSite = getGoogleSiteFromUrl(targetUrl);
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(googleSite)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate, endDate, dimensions: ["query", "page"], rowLimit: limit,
        orderBy: [{ fieldName: "position", sortOrder: "ASCENDING" }],
      }),
    }
  );
  if (!res.ok) throw new Error(`Search Console API error for ${targetUrl}: ${res.status}`);
  const data = await res.json();
  return (data.rows ?? []).map((row: { keys: string[]; position: number }) => ({
    keyword: row.keys[0],
    position: Math.round(row.position),
    url: row.keys[1] ?? targetUrl,
    searchEngine: "google" as const,
  }));
}

// ── 2. Backlinks via DataForSEO ──────────────────────────
export async function fetchBacklinks(targetUrl: string, limit = 100): Promise<BacklinkRecord[]> {
  const credentials = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
  const res = await fetch("https://api.dataforseo.com/v3/backlinks/backlinks/live", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ target: targetUrl, limit, order_by: ["domain_from_rank,desc"], filters: ["dofollow", "=", true] }]),
  });
  if (!res.ok) throw new Error(`DataForSEO error for ${targetUrl}: ${res.status}`);
  const data = await res.json();
  const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.map((item: any) => ({
    sourceUrl: item.url_from,
    targetUrl: item.url_to,
    anchorText: item.anchor,
    domainAuthority: item.domain_from_rank,
    discoveredAt: new Date(item.first_seen),
    isNew: false,
  }));
}

// ── 3. PageSpeed Insights ────────────────────────────────
interface PageSpeedResult { score: number; lcp: number; fid: number; cls: number; }
export async function fetchPageSpeed(targetUrl: string): Promise<PageSpeedResult> {
  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=mobile&key=${process.env.PAGESPEED_API_KEY}`);
  if (!res.ok) throw new Error(`PageSpeed API error for ${targetUrl}: ${res.status}`);
  const data = await res.json();
  const cats = data.lighthouseResult?.categories;
  const audits = data.lighthouseResult?.audits;
  return {
    score: Math.round((cats?.performance?.score ?? 0) * 100),
    lcp: audits?.["largest-contentful-paint"]?.numericValue ?? 0,
    fid: audits?.["total-blocking-time"]?.numericValue ?? 0,
    cls: audits?.["cumulative-layout-shift"]?.numericValue ?? 0,
  };
}

// ── 4. Uptime check ──────────────────────────────────────
export async function checkUptime(targetUrl: string): Promise<{ up: boolean; responseMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch(targetUrl, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    return { up: res.ok, responseMs: Date.now() - start };
  } catch {
    return { up: false, responseMs: Date.now() - start };
  }
}

// ── 5. Diff & alert generation ───────────────────────────
function detectAlerts(current: PortfolioSnapshot, previous: PortfolioSnapshot | null): PortfolioAlert[] {
  const alerts: PortfolioAlert[] = [];
  if (previous) {
    const prevMap = new Map(previous.rankings.map(r => [r.keyword, r.position]));
    for (const r of current.rankings) {
      const prev = prevMap.get(r.keyword);
      if (prev && r.position - prev >= 5) {
        alerts.push({
          type: "ranking-drop",
          severity: r.position - prev >= 10 ? "critical" : "warning",
          message: `"${r.keyword}" dropped from #${prev} to #${r.position}`,
          data: { keyword: r.keyword, from: prev, to: r.position },
        });
      }
    }
    const prevBLs = new Set(previous.backlinks.map(b => b.sourceUrl));
    for (const b of current.backlinks) {
      if (!prevBLs.has(b.sourceUrl)) {
        alerts.push({
          type: "new-backlink", severity: "info",
          message: `New backlink from ${b.sourceUrl} (DA: ${b.domainAuthority ?? "?"})`,
          data: { sourceUrl: b.sourceUrl, anchor: b.anchorText },
        });
      }
    }
    if (previous.pagespeedScore && current.pagespeedScore && previous.pagespeedScore - current.pagespeedScore >= 10) {
      alerts.push({
        type: "pagespeed-drop", severity: "warning",
        message: `PageSpeed dropped from ${previous.pagespeedScore} to ${current.pagespeedScore}`,
        data: { from: previous.pagespeedScore, to: current.pagespeedScore },
      });
    }
  }
  return alerts;
}

// ── 6. AI insights with Groq ─────────────────────────────
async function generateInsights(snapshot: PortfolioSnapshot, alerts: PortfolioAlert[]): Promise<string> {
  const topKeywords = snapshot.rankings.slice(0, 10).map(r => `  #${r.position} "${r.keyword}"`).join("\n");
  const alertSummary = alerts.map(a => `  [${a.severity}] ${a.message}`).join("\n");
  const prompt = `Analyse this portfolio SEO snapshot for ${snapshot.url} and give 3 specific, actionable recommendations.

Top keywords:
${topKeywords || "  (no data)"}

Alerts:
${alertSummary || "  None"}

PageSpeed score: ${snapshot.pagespeedScore ?? "N/A"}
Total backlinks: ${snapshot.backlinks.length}

Be specific — mention actual keywords and numbers. Max 200 words. Format as a numbered list.`;
  return callGroq(prompt);
}

// ── 7. Main runner (exported) – now takes targetUrl ─────
export async function runPortfolioTracker(
  targetUrl: string,
  previousSnapshot: PortfolioSnapshot | null = null
): Promise<PortfolioSnapshot> {
  console.log(`[portfolio-tracker] Running snapshot for ${targetUrl}…`);
  const today = new Date();
  const startDate = new Date(today.getTime() - 28 * 86400000).toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  // Fetch data with graceful degradation
  const [rankings, backlinks, pagespeedResult, uptime] = await Promise.all([
    fetchKeywordRankings(targetUrl, startDate, endDate).catch(() => [] as KeywordRanking[]),
    fetchBacklinks(targetUrl).catch(() => [] as BacklinkRecord[]),
    fetchPageSpeed(targetUrl).catch(() => null as PageSpeedResult | null),
    checkUptime(targetUrl),
  ]);

  // Build snapshot
  const snapshot: PortfolioSnapshot = {
    id: crypto.randomUUID(),
    url: targetUrl,
    capturedAt: today,
    rankings: rankings,
    backlinks: backlinks,
    pagespeedScore: pagespeedResult?.score,
    coreWebVitals: pagespeedResult
      ? {
          lcp: pagespeedResult.lcp,
          fid: pagespeedResult.fid,
          cls: pagespeedResult.cls,
        }
      : undefined,
    alerts: [],
  };

  // Uptime alert
  if (!uptime.up) {
    snapshot.alerts.push({
      type: "uptime",
      severity: "critical",
      message: `${targetUrl} is DOWN (response: ${uptime.responseMs}ms)`,
      data: { responseMs: uptime.responseMs },
    });
  }

  // Compare with previous snapshot (if any)
  const alerts = detectAlerts(snapshot, previousSnapshot);
  snapshot.alerts.push(...alerts);

  // Generate AI insights
  const insights = await generateInsights(snapshot, alerts);

  // Send Telegram summary
  const criticalAlerts = alerts.filter(a => a.severity === "critical");
  const top5Keywords = snapshot.rankings.slice(0, 5).map(r => `#${r.position} ${r.keyword}`).join(" · ");
  await sendNotification({
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    agent: "portfolio-tracker",
    title: `📊 ${targetUrl} — ${today.toLocaleDateString()}`,
    body: [
      `🔑 Top keywords: ${top5Keywords || "N/A"}`,
      `⚡ PageSpeed: ${snapshot.pagespeedScore ?? "N/A"}/100`,
      `🔗 Backlinks: ${snapshot.backlinks.length}`,
      criticalAlerts.length > 0 ? `\n🚨 ALERTS:\n${criticalAlerts.map(a => `• ${a.message}`).join("\n")}` : "",
      `\n💡 Insights:\n${insights}`,
    ].filter(Boolean).join("\n"),
  });

  // Persist snapshot
  await publishEvent("portfolio", {
    agent: "portfolio-tracker",
    type: "snapshot-complete",
    payload: { snapshot },
  });

  return snapshot;
}

// ── 8. Competitor comparison – now accepts array of URLs ─
export async function compareWithCompetitors(urls: string[]): Promise<void> {
  const results = await Promise.allSettled(urls.map(url => fetchPageSpeed(url).catch(() => null)));
  const comparison = urls.map((url, i) => {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      return `${url}: ${r.value.score}/100 (LCP: ${Math.round(r.value.lcp)}ms)`;
    }
    return `${url}: failed or no key`;
  });
  await sendNotification({
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    agent: "portfolio-tracker",
    title: "🔍 PageSpeed comparison",
    body: comparison.join("\n"),
  });
}