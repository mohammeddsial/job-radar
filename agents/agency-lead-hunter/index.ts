// agents/agency-lead-hunter/index.ts
import type { AgencyLead, AgencyLeadSource } from "../../types";
import { sendNotification } from "../../telegram/bot";
import { publishEvent } from "../../lib/queue";
import { saveAgencyLeads } from "../../lib/lead-store";
import { findContactEmail } from "./email-finder";

// ── Agency profile (used for AI scoring) ─────────────────────────
const AGENCY_PROFILE = `
Agency: Warq Labs (waraqlabs.com)
Founder: Zahid Sher Sial — 16 years experience

Our three platforms:
- waraqlabs.com   — full-service web & design agency
- shersial.com    — personal portfolio & case studies
- getdesign.io    — on-demand design subscription service

Core services (in order of profitability):
1. Webflow Development — CMS, animations, e-commerce, bilingual RTL (Arabic/English)
2. React / Next.js — SaaS dashboards, product websites, landing pages
3. UI/UX Design — Figma design systems, product redesigns, mobile apps
4. WordPress — WooCommerce, custom themes, performance optimisation
5. Design Subscription (getdesign.io) — unlimited design requests, flat monthly fee

Ideal client profile:
- B2B SaaS or e-commerce startup, Seed to Series B
- Company size 5–200 employees
- Budget $3,000–$50,000 per project OR $2,500/mo design subscription
- Needs: new website, redesign, CMS, bilingual site, MVP frontend, or ongoing design
- Regions: UAE/GCC (bilingual specialist), UK, US, Australia, Canada

NOT a fit:
- Large enterprise with in-house team
- Solo founders with no budget
- Non-web projects
`.trim();

// ── Groq helper ───────────────────────────────────────────────────
async function callGroq(prompt: string, jsonMode = true): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// ────────────────────────────────────────────────────────────────────
// SOURCE 1 — GrowthTalent.org
// Companies hiring growth/marketing = actively scaling = need web work
// API: https://www.growthtalent.org/agents
// ────────────────────────────────────────────────────────────────────
interface GTJob {
  id: string;
  slug: string;
  title: string;
  company: {
    name?: string;
    website?: string;
    description?: string;
    size?: string;
    location?: string;
    country?: string;
  };
  category?: string;
  location?: string;
  remote?: boolean;
  description?: string;
}

const GT_CATEGORIES = [
  "growth-marketing",
  "head-of-growth",
  "performance-marketing",
  "product-marketing",
  "seo",
  "crm-lifecycle",
];

async function fetchGrowthTalentLeads(): Promise<RawLead[]> {
  const apiKey = process.env.GT_API_KEY;
  if (!apiKey) {
    console.warn("[lead-hunter] GT_API_KEY missing — skipping GrowthTalent");
    return [];
  }

  const leads: RawLead[] = [];
  const seen  = new Set<string>();

  for (const category of GT_CATEGORIES) {
    try {
      const url = `https://www.growthtalent.org/api/v1/jobs?category=${category}&limit=20&remote=true`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { console.warn(`[lead-hunter] GT ${category}: ${res.status}`); continue; }

      const data = await res.json();
      const jobs: GTJob[] = data.jobs || data.data || (Array.isArray(data) ? data : []);

      for (const job of jobs) {
        const name = (typeof job.company === "string" ? job.company : job.company?.name) || "";
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());

        const companyObj = typeof job.company === "object" ? job.company : {};
        leads.push({
          company: name,
          website: companyObj.website || "",
          country: companyObj.country || companyObj.location || job.location || "Unknown",
          industry: `Scaling Startup (${category.replace(/-/g, " ")})`,
          companySize: (companyObj.size || "11-50") as RawLead["companySize"],
          description: `Hiring: ${job.title}. ${(companyObj.description || job.description || "").slice(0, 200)}`,
          source: "growthtalent",
        });
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`[lead-hunter] GT error for ${category}:`, err);
    }
  }
  console.log(`[lead-hunter] GrowthTalent: ${leads.length} companies`);
  return leads;
}

// ────────────────────────────────────────────────────────────────────
// SOURCE 2 — Apollo.io People/Company Search
// ────────────────────────────────────────────────────────────────────
interface ApolloContact {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  email?: string;
  linkedin_url?: string;
  organization?: {
    name: string;
    website_url?: string;
    industry?: string;
    estimated_num_employees?: number;
    country?: string;
    short_description?: string;
    primary_domain?: string;
  };
}

const APOLLO_CONFIGS = [
  { person_titles: ["Founder", "Co-Founder", "CEO"], num_employees_ranges: ["1,10","11,50"], industries: ["Software","Internet","E-Commerce","SaaS"] },
  { person_titles: ["Head of Marketing","VP Marketing","CMO","Product Manager"], num_employees_ranges: ["11,50","51,200"], industries: ["Software","Fintech","E-Commerce","Real Estate"] },
  { person_titles: ["Founder","CEO","Managing Director"], person_locations: ["United Arab Emirates","Saudi Arabia","Qatar","Kuwait"], num_employees_ranges: ["1,10","11,50","51,200"] },
];

async function searchApolloLeads(): Promise<ApolloContact[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) { console.warn("[lead-hunter] APOLLO_API_KEY missing"); return []; }
  const contacts: ApolloContact[] = [];
  for (const config of APOLLO_CONFIGS) {
    try {
      const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ ...config, per_page: 10, page: 1 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      contacts.push(...(data.people || []));
      await new Promise(r => setTimeout(r, 600));
    } catch (err) { console.error("[lead-hunter] Apollo error:", err); }
  }
  const seen = new Set<string>();
  return contacts.filter(c => {
    const domain = c.organization?.primary_domain || c.organization?.website_url;
    if (!domain || seen.has(domain)) return false;
    seen.add(domain);
    return true;
  });
}

// ────────────────────────────────────────────────────────────────────
// SOURCE 3 — Product Hunt
// ────────────────────────────────────────────────────────────────────
interface PHPost { name: string; tagline: string; website: string; votesCount: number; maker?: { name: string } }

async function fetchProductHuntLeads(): Promise<PHPost[]> {
  const token = process.env.PRODUCT_HUNT_TOKEN;
  const query = `query { posts(first:30,order:VOTES){ edges{ node{ name tagline website votesCount makers{name username} } } } }`;
  try {
    const res = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token || ""}` },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data?.posts?.edges || [])
      .map((e: any) => ({ ...e.node, maker: e.node.makers?.[0] }))
      .filter((p: PHPost) => p.website && p.votesCount >= 50);
  } catch { return []; }
}

// ────────────────────────────────────────────────────────────────────
// SOURCE 4 — Google SERP
// ────────────────────────────────────────────────────────────────────
const SERP_QUERIES = [
  "startup looking for web development agency",
  "ecommerce brand looking for website redesign agency",
  "SaaS company need landing page redesign",
  "web design agency UAE Dubai 2025",
  "startup just raised seed funding needs website",
  "company hiring webflow developer 2025",
  "wordpress site redesign webflow agency",
];

async function searchGoogleForLeads(): Promise<Array<{title:string;url:string;snippet:string}>> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) { console.warn("[lead-hunter] SERPAPI_KEY missing"); return []; }
  const results: Array<{title:string;url:string;snippet:string}> = [];
  for (const q of SERP_QUERIES.slice(0, 5)) {
    try {
      const url = `https://serpapi.com/search.json?${new URLSearchParams({ q, api_key: apiKey, num: "10", hl: "en", gl: "us" })}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.organic_results || []) {
        if (r.link && !r.link.includes("reddit.com") && !r.link.includes("quora.com"))
          results.push({ title: r.title || "", url: r.link, snippet: r.snippet || "" });
      }
      await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────
// EMAIL FINDER — Hunter.io
// ────────────────────────────────────────────────────────────────────
export async function findContactEmail(domain: string, firstName?: string, lastName?: string): Promise<string | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;
  try {
    if (firstName && lastName) {
      const params = new URLSearchParams({ domain, first_name: firstName, last_name: lastName, api_key: apiKey });
      const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.email && (data.data?.score || 0) >= 70) return data.data.email;
      }
    }
    const params = new URLSearchParams({ domain, api_key: apiKey, limit: "10" });
    const res = await fetch(`https://api.hunter.io/v2/domain-search?${params}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const emails: any[] = data.data?.emails || [];
    const exec = emails
      .filter(e => ["founder","ceo","owner","director","head","vp","president"].some(kw => (e.position || "").toLowerCase().includes(kw)))
      .sort((a,b) => (b.confidence||0) - (a.confidence||0));
    return exec[0]?.value || emails.sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0]?.value || null;
  } catch { return null; }
}

// ────────────────────────────────────────────────────────────────────
// RAW LEAD TYPE
// ────────────────────────────────────────────────────────────────────
interface RawLead {
  company: string;
  website: string;
  country?: string;
  industry?: string;
  companySize?: string;
  contactName?: string;
  contactTitle?: string;
  description?: string;
  source: AgencyLeadSource;
}

// ────────────────────────────────────────────────────────────────────
// AI SCORING — Groq
// ────────────────────────────────────────────────────────────────────
async function scoreLeads(raw: RawLead[]): Promise<AgencyLead[]> {
  if (raw.length === 0) return [];
  const batch = raw.slice(0, 20);
  const prompt = `You are a business development analyst for a web/design agency.

Agency profile:
${AGENCY_PROFILE}

Score each lead 0-100 and identify their top pain points.

Leads:
${JSON.stringify(batch.map(l=>({ company:l.company, website:l.website, country:l.country, industry:l.industry, size:l.companySize, role:l.contactTitle, description:(l.description||"").slice(0,200) })),null,1)}

Scoring:
- 85-100: Perfect — right industry, right size, clear need, likely budget
- 70-84:  Good fit
- 55-69:  Possible
- 0-54:   Skip

Return: { "leads": [{ "company":"...", "score":82, "pain_points":["..."], "region":"UAE|US|UK|EU|APAC|OTHER", "recommended_service":"Webflow|React|WordPress|UI/UX|Design Subscription", "pitch_angle":"one sentence" }] }`;

  try {
    const result  = await callGroq(prompt);
    const parsed  = JSON.parse(result.replace(/\`\`\`json|\`\`\`/g, "").trim());
    const scoreMap = new Map<string,any>((parsed.leads||[]).map((l:any) => [l.company?.toLowerCase(), l]));
    return batch
      .map(raw => {
        const scored = scoreMap.get(raw.company?.toLowerCase()) || {};
        return {
          id: crypto.randomUUID(),
          company: raw.company,
          website: raw.website,
          industry: raw.industry || "Technology",
          companySize: (raw.companySize || "11-50") as AgencyLead["companySize"],
          country: raw.country || "Unknown",
          region: (scored.region || "OTHER") as AgencyLead["region"],
          contactName: raw.contactName,
          contactTitle: raw.contactTitle,
          source: raw.source,
          painPoints: scored.pain_points || [],
          recommendedService: scored.recommended_service,
          relevanceScore: scored.score || 0,
          notes: scored.pitch_angle,
          status: "discovered" as const,
          createdAt: new Date().toISOString(),
        } satisfies AgencyLead;
      })
      .filter(l => l.relevanceScore >= 55);
  } catch (err) { console.error("[lead-hunter] Scoring error:", err); return []; }
}

// ────────────────────────────────────────────────────────────────────
// MAIN RUNNER
// ────────────────────────────────────────────────────────────────────
export interface LeadHunterConfig {
  minScore?:   number;
  dailyLimit?: number;
  sources?:    Array<"apollo"|"product-hunt"|"serp"|"growthtalent">;
  findEmails?: boolean;
}

export async function runLeadHunter(config: LeadHunterConfig = {}): Promise<AgencyLead[]> {
  const {
    minScore   = 60,
    dailyLimit = 30,
    sources    = ["growthtalent","apollo","product-hunt","serp"],
    findEmails = true,
  } = config;

  console.log("[lead-hunter] 🌍 Starting global agency lead search...");
  const rawLeads: RawLead[] = [];

  // Gather all sources in parallel
  const [gtLeads, apolloContacts, phPosts, serpResults] = await Promise.all([
    sources.includes("growthtalent") ? fetchGrowthTalentLeads() : Promise.resolve([]),
    sources.includes("apollo")       ? searchApolloLeads()      : Promise.resolve([]),
    sources.includes("product-hunt") ? fetchProductHuntLeads()  : Promise.resolve([]),
    sources.includes("serp")         ? searchGoogleForLeads()   : Promise.resolve([]),
  ]);

  // GrowthTalent leads (already RawLead format)
  rawLeads.push(...gtLeads);

  // Apollo contacts → RawLead
  for (const c of apolloContacts) {
    if (!c.organization) continue;
    const emp = c.organization.estimated_num_employees;
    rawLeads.push({
      company: c.organization.name,
      website: c.organization.website_url || `https://${c.organization.primary_domain}` || "",
      country: c.organization.country,
      industry: c.organization.industry,
      companySize: (!emp ? "11-50" : emp<=10?"1-10" : emp<=50?"11-50" : emp<=200?"51-200":"201-500") as any,
      contactName: `${c.first_name} ${c.last_name}`.trim(),
      contactTitle: c.title,
      description: c.organization.short_description,
      source: "apollo",
    });
  }

  // Product Hunt → RawLead
  for (const post of phPosts) {
    if (!post.website) continue;
    rawLeads.push({ company: post.name, website: post.website, country: "US", industry: "Technology/Startup", contactName: post.maker?.name, description: post.tagline, source: "product-hunt" });
  }

  // SERP → RawLead
  for (const r of serpResults) {
    try {
      const domain = new URL(r.url).hostname.replace("www.","");
      rawLeads.push({ company: (r.title.split(" - ")[0] || r.title.split(" | ")[0] || domain).trim().slice(0,80), website: r.url, description: r.snippet, source: "google-serp" });
    } catch {}
  }

  console.log(`[lead-hunter] Sources — GT:${gtLeads.length} Apollo:${apolloContacts.length} PH:${phPosts.length} SERP:${serpResults.length}`);

  // Deduplicate by domain
  const seen = new Set<string>();
  const unique = rawLeads.filter(l => {
    if (!l.website) return false;
    try {
      const domain = new URL(l.website.startsWith("http") ? l.website : `https://${l.website}`).hostname.replace("www.","");
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch { return false; }
  });
  console.log(`[lead-hunter] ${unique.length} unique companies`);

  // Score
  const scored = await scoreLeads(unique);
  const qualified = scored.filter(l => l.relevanceScore >= minScore).sort((a,b)=>b.relevanceScore-a.relevanceScore).slice(0,dailyLimit);
  console.log(`[lead-hunter] ${qualified.length} qualified leads (score >= ${minScore})`);

  // Find emails
  if (findEmails) {
    let found = 0;
    for (const lead of qualified) {
      if (lead.contactEmail) { found++; continue; }
      try {
        const domain = new URL(lead.website.startsWith("http") ? lead.website : `https://${lead.website}`).hostname.replace("www.","");
        const parts  = lead.contactName?.split(" ") || [];
        const email  = await findContactEmail(domain, parts[0], parts.slice(1).join(" "));
        if (email) { lead.contactEmail = email; lead.status = "email-queued"; found++; }
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    console.log(`[lead-hunter] ${found}/${qualified.length} leads have emails`);
  }

  await saveAgencyLeads(qualified);

  const withEmail = qualified.filter(l => l.contactEmail);
  const top5 = qualified.slice(0,5).map(l =>
    `• *${l.company}* (${l.country||l.region}) — ${l.relevanceScore}/100\n  🎯 ${l.recommendedService||"Web Dev"} | ${l.painPoints[0]||""}\n  ${l.contactEmail ? `📧 ${l.contactEmail}` : "📧 No email yet"}`
  ).join("\n\n");

  await sendNotification({
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    agent: "outreach",
    title: `🌍 Lead Hunt — ${qualified.length} leads (${withEmail.length} with emails)`,
    body: [
      `📊 GT:${gtLeads.length} | Apollo:${apolloContacts.length} | PH:${phPosts.length} | SERP:${serpResults.length}`,
      ``, `*Top leads:*`, top5,
    ].join("\n"),
    actions: [
      { label: "🚀 Start Email Campaign", callbackData: "agency:start-campaign" },
      { label: "📋 View All Leads",       callbackData: "agency:view-leads" },
    ],
  });

  await publishEvent("outreach", {
    agent: "outreach",
    type: "agency-leads-ready",
    payload: { count: withEmail.length, topScore: qualified[0]?.relevanceScore||0 },
  });

  return qualified;
}

export { scoreLeads, searchApolloLeads, fetchProductHuntLeads, searchGoogleForLeads, fetchGrowthTalentLeads };
