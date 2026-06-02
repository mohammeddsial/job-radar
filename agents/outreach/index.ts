// agents/outreach/index.ts – Groq version with full implementations
import type { OutreachLead, OutreachMessage } from "../../types";
import { requestApproval } from "../../telegram/bot";
import { publishEvent } from "../../lib/queue";

// ── Groq helper ───────────────────────────────────────
async function callGroq(prompt: string, system?: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");
  const messages: any[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// ── Lead discovery ─────────────────────────────────────
interface RawLead {
  source: "linkedin" | "upwork";
  name: string;
  title: string;
  company: string;
  profileUrl: string;
  summary?: string;
}

async function searchLinkedInLeads(query: string): Promise<RawLead[]> {
  const cookie = process.env.LINKEDIN_COOKIE;
  if (!cookie) {
    console.warn("[outreach] LINKEDIN_COOKIE missing – returning empty leads");
    return [];
  }
  try {
    const res = await fetch(
      `https://www.linkedin.com/voyager/api/search/blended?keywords=${encodeURIComponent(query)}&origin=GLOBAL_SEARCH_HEADER&q=all`,
      {
        headers: {
          cookie: `li_at=${cookie}`,
          "x-restli-protocol-version": "2.0.0",
          "csrf-token": process.env.LINKEDIN_CSRF ?? "",
        },
      }
    );
    if (!res.ok) throw new Error(`LinkedIn search failed: ${res.status}`);
    const data = await res.json();
    const elements: any[] = data.data?.elements ?? [];
    return elements
      .flatMap((e: any) => e.elements ?? [])
      .filter((e: any) => e.type === "MINI_PROFILE")
      .map((e: any) => ({
        source: "linkedin" as const,
        name: e.title?.text ?? "Unknown",
        title: e.primarySubtitle?.text ?? "",
        company: e.secondarySubtitle?.text ?? "",
        profileUrl: `https://www.linkedin.com/in/${e.targetUrn?.split(":").pop()}`,
        summary: "",
      }));
  } catch (err) {
    console.error("[outreach] LinkedIn error:", err);
    return [];
  }
}

async function searchUpworkLeads(query: string): Promise<RawLead[]> {
  const token = process.env.UPWORK_OAUTH_TOKEN;
  if (!token) {
    console.warn("[outreach] UPWORK_OAUTH_TOKEN missing – returning empty leads");
    return [];
  }
  try {
    const res = await fetch(
      `https://www.upwork.com/api/profiles/v1/search/jobs.json?q=${encodeURIComponent(query)}&paging=0%3B10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Upwork search failed: ${res.status}`);
    const data = await res.json();
    return (data.jobs ?? []).map((j: any) => ({
      source: "upwork" as const,
      name: j.client?.country ?? "Client",
      title: j.title,
      company: j.client?.company_name ?? "—",
      profileUrl: `https://www.upwork.com/jobs/${j.id}`,
      summary: j.snippet,
    }));
  } catch (err) {
    console.error("[outreach] Upwork error:", err);
    return [];
  }
}

// ── Relevance scoring with Groq ───────────────────────
async function scoreLeadRelevance(lead: RawLead, portfolio: string): Promise<number> {
  const prompt = `You are a freelance business advisor. Score this lead's relevance to a web developer / designer named Shersial (portfolio: ${portfolio}) from 0–100.

Lead:
Name: ${lead.name}
Title: ${lead.title}
Company: ${lead.company}
Summary: ${lead.summary ?? "N/A"}

Respond with ONLY a JSON object: {"score": <number>, "reason": "<10 words>"}`;
  const response = await callGroq(prompt);
  try {
    const parsed = JSON.parse(response.replace(/```json|```/g, "").trim());
    return Math.min(100, Math.max(0, Number(parsed.score) || 0));
  } catch {
    return 0;
  }
}

// ── Message drafting with Groq ────────────────────────
export async function draftOutreachMessage(lead: OutreachLead, style: "linkedin" | "upwork" | "email"): Promise<string> {
  const system = `You are Shersial, a skilled web developer and designer at shersial.com. Draft a personalised, authentic ${style} outreach message.`;
  const userPrompt = `To: ${lead.name} (${lead.title} at ${lead.company})

Rules:
- Max 120 words for LinkedIn/Upwork, 200 for email
- Reference something specific about their role/company
- Mention ONE relevant project from the portfolio (make up a realistic one if needed)
- End with a soft CTA (e.g. "Would love to connect")
- No generic openers like "I hope this finds you well"
- Tone: warm and professional, never pushy

Lead notes: ${lead.notes || "No additional context"}

Return ONLY the message body, no subject line.`;
  return callGroq(userPrompt, system);
}

// ── Main agent runner ─────────────────────────────────
export interface OutreachAgentConfig {
  searchQuery: string;
  portfolio: string;
  minScore: number;
  dailyLimit: number;
  platforms: Array<"linkedin" | "upwork">;
}

export async function runOutreachAgent(config: OutreachAgentConfig): Promise<void> {
  console.log("[outreach] Starting lead search…");
  const rawLeads: RawLead[] = [];
  if (config.platforms.includes("linkedin")) rawLeads.push(...await searchLinkedInLeads(config.searchQuery));
  if (config.platforms.includes("upwork")) rawLeads.push(...await searchUpworkLeads(config.searchQuery));
  console.log(`[outreach] Found ${rawLeads.length} raw leads`);

  const scored = await Promise.all(rawLeads.map(async lead => ({ lead, score: await scoreLeadRelevance(lead, config.portfolio) })));
  const qualified = scored.filter(s => s.score >= config.minScore).sort((a,b) => b.score - a.score).slice(0, config.dailyLimit);
  console.log(`[outreach] ${qualified.length} qualified leads after scoring`);

  for (const { lead, score } of qualified) {
    const outreachLead: OutreachLead = {
      id: crypto.randomUUID(),
      source: lead.source,
      name: lead.name,
      title: lead.title,
      company: lead.company,
      profileUrl: lead.profileUrl,
      relevanceScore: score,
      notes: lead.summary ?? "",
      status: "discovered",
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
    const messagePlatform = lead.source === "upwork" ? "upwork" : "linkedin";
    const body = await draftOutreachMessage(outreachLead, messagePlatform);
    const outreachMessage: OutreachMessage = {
      id: crypto.randomUUID(),
      leadId: outreachLead.id,
      platform: messagePlatform,
      body,
      tone: "professional",
      approved: false,
    };
    const preview = [
      `👤 *${lead.name}* — ${lead.title} @ ${lead.company}`,
      `📊 Score: ${score}/100`,
      `🔗 ${lead.profileUrl}`,
      ``,
      `📝 Draft message:`,
      body,
    ].join("\n");
    await requestApproval({
      agent: "outreach",
      resourceType: "outreach-message",
      resourceId: outreachMessage.id,
      preview,
    });
    await publishEvent("outreach", {
      agent: "outreach",
      type: "lead-with-message-ready",
      payload: { lead: outreachLead, message: outreachMessage },
    });
  }
}

// ── Send approved message ─────────────────────────────
export async function sendApprovedMessage(message: OutreachMessage): Promise<void> {
  if (message.platform === "linkedin") await sendLinkedInMessage(message);
  else if (message.platform === "upwork") await sendUpworkProposal(message);
}

async function sendLinkedInMessage(msg: OutreachMessage): Promise<void> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    console.warn("[outreach] LINKEDIN_ACCESS_TOKEN missing – cannot send message");
    return;
  }
  await fetch("https://api.linkedin.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipients: { values: [{ person: { id: msg.leadId } }] },
      subject: msg.subject ?? "Quick hello",
      body: msg.body,
    }),
  });
}

async function sendUpworkProposal(msg: OutreachMessage): Promise<void> {
  const token = process.env.UPWORK_OAUTH_TOKEN;
  if (!token) {
    console.warn("[outreach] UPWORK_OAUTH_TOKEN missing – cannot send proposal");
    return;
  }
  await fetch(`https://www.upwork.com/api/hr/v2/contracts/offers.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      job_reference_cipheredId: msg.leadId,
      cover_letter: msg.body,
    }),
  });
}