// agents/agency-lead-hunter/index.ts
// ─────────────────────────────────────────────────────────────────
// AGENT 1 — GLOBAL AGENCY LEAD HUNTER
//
// What it does:
//   Finds companies worldwide that are likely to need web/design services.
//   Sources: Apollo.io (B2B database), Product Hunt (new launches),
//            Google SERP (buying-intent searches), Crunchbase signals.
//   After scoring with Groq, it finds decision-maker emails via Hunter.io
//   and queues qualified leads for the Email Campaign Agent.
//
// Required env vars:
//   GROQ_API_KEY          — already in your project
//   APOLLO_API_KEY        — apollo.io (free: 50 exports/month)
//   HUNTER_API_KEY        — hunter.io (free: 25 searches/month)
//   SERPAPI_KEY           — serpapi.com (free: 100/month) OR reuse JSEARCH_API_KEY
//   PRODUCT_HUNT_TOKEN    — producthunt.com/v2/oauth/token (free)
//   TELEGRAM_CHAT_ID      — already in your project
// ─────────────────────────────────────────────────────────────────

import type { AgencyLead, AgencyLeadSource } from "../../types";
import { sendNotification } from "../../telegram/bot";
import { publishEvent } from "../../lib/queue";
import { saveAgencyLeads, updateLead } from "../../lib/lead-store";

// ── Agency profile (used for AI scoring) ─────────────────────────
const AGENCY_PROFILE = `
Agency: Warq Digital (warq.io) / Shersial Studio (shersial.com)
Founded by Zahid Sher Sial — 16 years experience

Core services (in order of profitability):
1. Webflow Development — CMS, animations, e-commerce, bilingual RTL (Arabic/English)
2. React / Next.js — SaaS dashboards, product websites, landing pages
3. UI/UX Design — Figma design systems, product redesigns, mobile apps
4. WordPress — WooCommerce, custom themes, performance optimisation
5. Branding & Design Systems — style guides, component libraries

Ideal client profile:
- B2B SaaS or e-commerce startup, Seed → Series B
- Company size 5–200 employees
- Budget $3,000–$50,000 per project
- Needs: new website, redesign, CMS, bilingual site, or MVP frontend
- Regions: UAE/GCC (bilingual specialist), UK, US, Australia, Canada

NOT a fit:
- Large enterprise with in-house team
- Solo founders with no budget
- Non-web projects (apps, mobile-only)
`.trim();

// ── Groq helper ───────────────────────────────────────────────────
async function callGroq(prompt: string, jsonMode = true): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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
// SOURCE 1 — Apollo.io People/Company Search
// Finds decision-makers at companies that match our ideal client profile
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

const APOLLO_SEARCH_CONFIGS = [
  {
    // Startup founders/CEOs — perfect for new websites
    person_titles: ["Founder", "Co-Founder", "CEO"],
    q_organization_domains_list: [],
    num_employees_ranges: ["1,10", "11,50"],
    industries: ["Software", "Internet", "E-Commerce", "Technology", "SaaS"],
  },
  {
    // Marketing/Product leads — often buy design/web services
    person_titles: ["Head of Marketing", "VP Marketing", "CMO", "Head of Product", "Product Manager"],
    num_employees_ranges: ["11,50", "51,200"],
    industries: ["Software", "Fintech", "E-Commerce", "Real Estate", "Healthcare"],
  },
  {
    // UAE/GCC market — our Arabic/bilingual specialty
    person_titles: ["Founder", "CEO", "Managing Director", "General Manager"],
    person_locations: ["United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait"],
    num_employees_ranges: ["1,10", "11,50", "51,200"],
  },
];

async function searchApolloLeads(): Promise<ApolloContact[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn("[lead-hunter] APOLLO_API_KEY missing — skipping Apollo search");
    return [];
  }

  const contacts: ApolloContact[] = [];

  for (const config of APOLLO_SEARCH_CONFIGS) {
    try {
      const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify({ ...config, per_page: 10, page: 1 }),
      });

      if (!res.ok) {
        console.warn(`[lead-hunter] Apollo search failed: ${res.status}`);
        continue;
      }

      const data = await res.json();
      contacts.push(...(data.people || []));
      await new Promise(r => setTimeout(r, 600)); // rate limiting
    } catch (err) {
      console.error("[lead-hunter] Apollo error:", err);
    }
  }

  // Deduplicate by organization domain
  const seen = new Set<string>();
  return contacts.filter(c => {
    const domain = c.organization?.primary_domain || c.organization?.website_url;
    if (!domain || seen.has(domain)) return false;
    seen.add(domain);
    return true;
  });
}

// ────────────────────────────────────────────────────────────────────
// SOURCE 2 — Product Hunt New Launches
// Freshly launched products = companies that just got attention
// and will soon need a better website, landing page, or redesign
// ────────────────────────────────────────────────────────────────────
interface PHPost {
  name: string;
  tagline: string;
  website: string;
  votesCount: number;
  maker?: { name: string; username: string };
}

async function fetchProductHuntLeads(): Promise<PHPost[]> {
  const token = process.env.PRODUCT_HUNT_TOKEN;

  // Product Hunt public API allows basic queries with a developer token
  const query = `
    query {
      posts(first: 30, order: VOTES) {
        edges {
          node {
            name
            tagline
            website
            votesCount
            makers { name username }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token || ""}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`PH error: ${res.status}`);
    const data = await res.json();

    return (data.data?.posts?.edges || [])
      .map((e: any) => ({
        ...e.node,
        maker: e.node.makers?.[0],
      }))
      .filter((p: PHPost) => p.website && p.votesCount >= 50); // quality filter
  } catch (err) {
    console.error("[lead-hunter] Product Hunt error:", err);
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────
// SOURCE 3 — Google SERP buying-intent searches
// These queries target companies actively looking for services like ours
// ────────────────────────────────────────────────────────────────────
const SERP_QUERIES = [
  // High buying intent — UAE focus
  "company looking for webflow agency UAE",
  "startup needs web design agency UAE Dubai",
  // High buying intent — global
  "startup hiring webflow developer 2025",
  "ecommerce brand looking for website redesign",
  "SaaS company need landing page redesign agency",
  // Trigger events — new funding = new website budget
  "startup just raised funding needs website",
  "series A startup web design",
  // Pain point searches
  "wordpress site slow redesign webflow",
  "website looks outdated redesign agency",
];

interface SerpResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchGoogleForLeads(): Promise<SerpResult[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.warn("[lead-hunter] SERPAPI_KEY missing — skipping Google SERP search");
    return [];
  }

  const results: SerpResult[] = [];
  // Limit to 5 queries per run to stay within free tier
  const batch = SERP_QUERIES.slice(0, 5);

  for (const q of batch) {
    try {
      const url = `https://serpapi.com/search.json?${new URLSearchParams({
        q,
        api_key: apiKey,
        num: "10",
        hl: "en",
        gl: "us",
      })}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      const data = await res.json();
      for (const r of data.organic_results || []) {
        if (r.link && !r.link.includes("reddit.com") && !r.link.includes("quora.com")) {
          results.push({ title: r.title || "", url: r.link, snippet: r.snippet || "" });
        }
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`[lead-hunter] SERP error for "${q}":`, err);
    }
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────
// EMAIL FINDER — Hunter.io
// Finds the decision-maker's email given a company domain
// ────────────────────────────────────────────────────────────────────
export async function findContactEmail(
  domain: string,
  firstName?: string,
  lastName?: string
): Promise<string | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;

  try {
    // If we have a name, use email-finder (most accurate)
    if (firstName && lastName) {
      const params = new URLSearchParams({ domain, first_name: firstName, last_name: lastName, api_key: apiKey });
      const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const email = data.data?.email;
        const confidence = data.data?.score || 0;
        if (email && confidence >= 70) return email;
      }
    }

    // Fallback: domain search — grab highest-confidence executive email
    const params = new URLSearchParams({ domain, api_key: apiKey, limit: "10" });
    const res = await fetch(`https://api.hunter.io/v2/domain-search?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const emails: any[] = data.data?.emails || [];
    const exec = emails
      .filter(e => ["founder", "ceo", "owner", "director", "head", "vp", "president"]
        .some(kw => (e.type || "").toLowerCase().includes(kw) || (e.position || "").toLowerCase().includes(kw)))
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    return exec[0]?.value || emails.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0]?.value || null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// AI SCORING — Groq
// Scores each raw lead 0–100 and extracts pain points
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

async function scoreLeads(raw: RawLead[]): Promise<AgencyLead[]> {
  if (raw.length === 0) return [];

  const batch = raw.slice(0, 20); // Groq context limit

  const prompt = `You are a business development analyst for a web/design agency.

Agency profile:
${AGENCY_PROFILE}

Score each lead 0-100 and identify their top pain points.

Leads to score:
${JSON.stringify(batch.map(l => ({
  company: l.company,
  website: l.website,
  country: l.country,
  industry: l.industry,
  size: l.companySize,
  role: l.contactTitle,
  description: (l.description || "").slice(0, 200),
})), null, 1)}

Scoring guide:
- 85-100: Perfect fit — right industry, right size, clear need for our services, likely budget
- 70-84:  Good fit — most criteria match
- 55-69:  Possible fit — some criteria match, worth trying
- 0-54:   Poor fit — skip

For each lead return:
{
  "company": "...",
  "score": 82,
  "pain_points": ["Outdated website hurting conversions", "No bilingual Arabic support"],
  "region": "UAE",
  "recommended_service": "Webflow",
  "pitch_angle": "One sentence: what specific problem we solve for THEM"
}

Return: { "leads": [...array of scored leads...] }`;

  try {
    const result = await callGroq(prompt);
    const parsed = JSON.parse(result.replace(/```json|```/g, "").trim());
    const scoreMap = new Map<string, any>(
      (parsed.leads || []).map((l: any) => [l.company?.toLowerCase(), l])
    );

    return batch
      .map(raw => {
        const scored = scoreMap.get(raw.company?.toLowerCase()) || {};
        return {
          id: crypto.randomUUID(),
          company: raw.company,
          website: raw.website,
          industry: raw.industry || "Technology",
          companySize: (raw.companySize || "1-50") as AgencyLead["companySize"],
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
  } catch (err) {
    console.error("[lead-hunter] Scoring error:", err);
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────
// MAIN RUNNER
// ────────────────────────────────────────────────────────────────────
export interface LeadHunterConfig {
  minScore?: number;
  dailyLimit?: number;
  sources?: Array<"apollo" | "product-hunt" | "serp">;
  findEmails?: boolean;
}

export async function runLeadHunter(config: LeadHunterConfig = {}): Promise<AgencyLead[]> {
  const {
    minScore = 60,
    dailyLimit = 25,
    sources = ["apollo", "product-hunt", "serp"],
    findEmails = true,
  } = config;

  console.log("[lead-hunter] 🌍 Starting global agency lead search...");
  const rawLeads: RawLead[] = [];

  // ── Gather from all sources in parallel ─────────────────────────
  const [apolloContacts, phPosts, serpResults] = await Promise.all([
    sources.includes("apollo") ? searchApolloLeads() : Promise.resolve([]),
    sources.includes("product-hunt") ? fetchProductHuntLeads() : Promise.resolve([]),
    sources.includes("serp") ? searchGoogleForLeads() : Promise.resolve([]),
  ]);

  // Map Apollo contacts
  for (const c of apolloContacts) {
    if (!c.organization) continue;
    rawLeads.push({
      company: c.organization.name,
      website: c.organization.website_url || `https://${c.organization.primary_domain}` || "",
      country: c.organization.country,
      industry: c.organization.industry,
      companySize: c.organization.estimated_num_employees
        ? (c.organization.estimated_num_employees <= 10 ? "1-10"
          : c.organization.estimated_num_employees <= 50 ? "11-50"
          : c.organization.estimated_num_employees <= 200 ? "51-200"
          : "201-500")
        : "11-50",
      contactName: `${c.first_name} ${c.last_name}`.trim(),
      contactTitle: c.title,
      description: c.organization.short_description,
      source: "apollo",
    });
  }

  // Map Product Hunt posts
  for (const post of phPosts) {
    if (!post.website) continue;
    rawLeads.push({
      company: post.name,
      website: post.website,
      country: "US",
      industry: "Technology/Startup",
      contactName: post.maker?.name,
      description: post.tagline,
      source: "product-hunt",
    });
  }

  // Map SERP results — extract company from title/URL
  for (const r of serpResults) {
    try {
      const domain = new URL(r.url).hostname.replace("www.", "");
      const companyName = r.title.split(" - ")[0] || r.title.split(" | ")[0] || domain;
      rawLeads.push({
        company: companyName.trim().slice(0, 80),
        website: r.url,
        description: r.snippet,
        source: "google-serp",
      });
    } catch { /* skip invalid URLs */ }
  }

  console.log(`[lead-hunter] Raw leads — Apollo: ${apolloContacts.length}, PH: ${phPosts.length}, SERP: ${serpResults.length}`);

  // ── Deduplicate by website domain ────────────────────────────────
  const seen = new Set<string>();
  const unique = rawLeads.filter(l => {
    if (!l.website) return false;
    try {
      const domain = new URL(
        l.website.startsWith("http") ? l.website : `https://${l.website}`
      ).hostname.replace("www.", "");
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch { return false; }
  });

  console.log(`[lead-hunter] ${unique.length} unique companies after deduplification`);

  // ── Score with AI ────────────────────────────────────────────────
  const scored = await scoreLeads(unique);
  const qualified = scored
    .filter(l => l.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, dailyLimit);

  console.log(`[lead-hunter] ${qualified.length} qualified leads (score >= ${minScore})`);

  // ── Find emails for qualified leads ─────────────────────────────
  if (findEmails) {
    let emailsFound = 0;
    for (const lead of qualified) {
      if (lead.contactEmail) { emailsFound++; continue; }

      try {
        const domain = new URL(
          lead.website.startsWith("http") ? lead.website : `https://${lead.website}`
        ).hostname.replace("www.", "");

        const nameParts = lead.contactName?.split(" ") || [];
        const email = await findContactEmail(
          domain,
          nameParts[0],
          nameParts.slice(1).join(" ")
        );

        if (email) {
          lead.contactEmail = email;
          lead.status = "email-queued";
          emailsFound++;
        }
      } catch { /* skip */ }

      await new Promise(r => setTimeout(r, 250)); // Hunter.io rate limit
    }
    console.log(`[lead-hunter] ${emailsFound}/${qualified.length} leads have contact emails`);
  }

  // ── Persist leads ────────────────────────────────────────────────
  await saveAgencyLeads(qualified);

  // ── Telegram summary ─────────────────────────────────────────────
  const withEmail = qualified.filter(l => l.contactEmail);
  const topFive = qualified.slice(0, 5).map(l =>
    [
      `• *${l.company}* (${l.country || l.region}) — ${l.relevanceScore}/100`,
      `  🎯 ${l.recommendedService || "Web Dev"} | ${l.painPoints[0] || "Needs web services"}`,
      l.contactEmail ? `  📧 ${l.contactEmail}` : "  📧 No email found",
    ].join("\n")
  ).join("\n\n");

  await sendNotification({
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    agent: "outreach",
    title: `🌍 Lead Hunt Complete — ${qualified.length} new leads`,
    body: [
      `✅ *${withEmail.length}* leads have emails, ready for outreach`,
      `📊 Sources: Apollo ${apolloContacts.length} | PH ${phPosts.length} | SERP ${serpResults.length}`,
      ``,
      `*Top leads:*`,
      topFive,
    ].join("\n"),
    actions: [
      { label: "🚀 Start Email Campaign", callbackData: "agency:start-campaign" },
      { label: "📋 View All Leads",       callbackData: "agency:view-leads" },
    ],
  });

  // ── Signal email campaign agent ──────────────────────────────────
  await publishEvent("outreach", {
    agent: "outreach",
    type: "agency-leads-ready",
    payload: {
      count: withEmail.length,
      topScore: qualified[0]?.relevanceScore || 0,
      sources: { apollo: apolloContacts.length, ph: phPosts.length, serp: serpResults.length },
    },
  });

  return qualified;
}

export { scoreLeads, searchApolloLeads, fetchProductHuntLeads, searchGoogleForLeads };
