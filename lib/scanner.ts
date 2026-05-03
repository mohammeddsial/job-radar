// lib/scanner.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface Job {
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

interface RawJob {
  title: string;
  company_name?: string;
  company?: string;
  candidate_required_location?: string;
  url: string;
  publication_date?: string;
  description?: string;
  tags?: string[];
  source?: string;
}

// ── Your real, targeted profile ──────────────────────────
const PROFILE = `
Zahid Sher Sial – Senior Webflow / Front-End / UI/UX Developer (16+ yrs)
Remote | Lahore, Pakistan | shersial.com

KEY SKILLS BY ROLE:
Webflow: CMS Collections, Finsweet, MemberStack, GSAP, RTL/Arabic, E-Commerce, 15+ sites.
Front-End: React, Next.js, TypeScript, Tailwind CSS, Shadcn UI, Vite, REST APIs.
UI/UX: Figma, Adobe XD, Design Systems, User Research, Wireframing, WCAG, Bilingual RTL.
WordPress: Elementor, WooCommerce, Custom Themes, ACF, WP Rocket, Nginx, 90+ Lighthouse.
IT/Project Management: Jira Admin, Agile/Scrum, Sprint Planning, JQL, Capacity Planning.

NOTABLE PROJECTS (company names to look for):
- Al Ghurair Exchange (Webflow, RTL)
- Cohrus HRMS (React, Shadcn)
- SEDD Government Portal (Liferay, Arabic/English)
- Juke Audio (Webflow E‑Commerce)
- Edarat Group (WordPress, Redis)

ACHIEVEMENTS: 35% task‑completion improvement, 40% fewer support tickets, 32+ projects.
LANGUAGES: English (Fluent), Arabic (Native), Urdu/Hindi.
CERTIFICATIONS: Webflow Layouts, Meta Front‑End, Liferay DXP, IT Degree.
`;

// ── helpers ───────────────────────────────────────────────
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ── 1. Remotive ───────────────────────────────────────────
async function fetchRemotiveJobs(): Promise<RawJob[]> {
  const searches = [
    "https://remotive.com/api/remote-jobs?category=design&limit=10",
    "https://remotive.com/api/remote-jobs?category=software-dev&search=frontend&limit=10",
    "https://remotive.com/api/remote-jobs?search=webflow&limit=10",
    "https://remotive.com/api/remote-jobs?search=wordpress&limit=8",
    "https://remotive.com/api/remote-jobs?search=ui+ux&limit=8",
  ];
  const results = await Promise.allSettled(
    searches.map((url) =>
      fetch(url, { headers: { "User-Agent": "JobRadar/1.0" } })
        .then((r) => r.json())
        .then((d) => (d.jobs || []) as RawJob[])
    )
  );
  const all: RawJob[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all;
}

// ── 2. Jobicy ─────────────────────────────────────────────
async function fetchJobicyJobs(): Promise<RawJob[]> {
  try {
    const res = await fetch(
      "https://jobicy.com/api/v2/remote-jobs?count=20&tag=frontend,webflow,wordpress,ui-ux-designer",
      { headers: { "User-Agent": "JobRadar/1.0" } }
    );
    const data = await res.json();
    return (data.jobs || []) as RawJob[];
  } catch {
    return [];
  }
}

// ── 3. Arbeitnow ──────────────────────────────────────────
async function fetchArbeitnowJobs(): Promise<RawJob[]> {
  try {
    const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
      headers: { "User-Agent": "JobRadar/1.0" },
    });
    const data = await res.json();
    const list = data.data || data.jobs || data;
    if (!Array.isArray(list)) return [];
    return list.map((j: any) => ({
      title: j.title,
      company_name: j.company_name,
      candidate_required_location: j.location || "Remote",
      url: j.url,
      publication_date: j.created_at?.toString(),
      description: stripHtml(j.description || "").slice(0, 500),
      tags: j.tags || [],
      source: "Arbeitnow",
    }));
  } catch {
    return [];
  }
}

// ── 4. Remote OK ──────────────────────────────────────────
async function fetchRemoteOKJobs(): Promise<RawJob[]> {
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "JobRadar/1.0" },
    });
    const data: any[] = await res.json();
    const jobs = data.filter((item: any) => item.slug && item.position);
    return jobs.map((j: any) => ({
      title: j.position || "",
      company_name: j.company || "",
      candidate_required_location: j.location || "Remote",
      url: j.apply_url || j.url || "",
      publication_date: j.date ? new Date(j.date).toISOString() : undefined,
      description: stripHtml(j.description || "").slice(0, 500),
      tags: j.tags || [],
      source: "RemoteOK",
    }));
  } catch {
    return [];
  }
}

// ── 5. LinkedIn via SerpApi (structured JSON) ──────────────
async function fetchLinkedInSerpApi(): Promise<RawJob[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const queries = [
    "webflow developer remote",
    "webflow cms remote",
    "wordpress developer remote",
    "wordpress elementor remote",
    "react typescript remote",
    "react developer remote",
    "nextjs remote",
    "frontend developer remote",
    "senior ui ux designer remote",
    "figma designer remote",
    "ui ux developer remote",
    "senior product designer remote",
    "product designer fintech remote",
    "technical project manager remote",
    "jira administrator remote",
    "scrum master remote",
    "webflow dubai",
    "react developer uae",
  ];

  const jobs: RawJob[] = [];
  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        engine: "linkedin_jobs",
        keywords: q,
        api_key: apiKey,
      });
      const res = await fetch(`https://serpapi.com/search?${params.toString()}`);
      const data = await res.json();
      for (const j of data.jobs_results || []) {
        jobs.push({
          title: j.title,
          company_name: j.company_name,
          candidate_required_location: j.location || "Remote",
          url: j.apply_link || j.link || "",
          publication_date: j.date_posted || "Recent",
          description: j.description?.slice(0, 300) || "",
          tags: [],
          source: "LinkedIn",
        });
      }
    } catch (e) {
      console.warn(`SerpApi fetch error for "${q}":`, e);
    }
  }
  return jobs;
}

// ── 6. LinkedIn RSS via ScrapingBee (renders JavaScript) ───
async function fetchLinkedInScrapingBee(): Promise<RawJob[]> {
  const apiKey = process.env.SCRAPINGBEE_KEY;
  if (!apiKey) return [];

  const urls = [
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=webflow&location=Remote",
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=wordpress%20developer&location=Remote",
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react%20typescript&location=Remote",
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=frontend%20developer&location=Remote",
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=ui%20ux%20designer&location=Remote",
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=product%20designer&location=Remote",
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=project%20manager&location=Remote",
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=webflow&location=Dubai",
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react%20developer&location=UAE",
  ];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(url)}&render_js=true`;
        const res = await fetch(proxyUrl);
        const text = await res.text();
        if (!text.includes("<item>")) return [];

        const jobs: RawJob[] = [];
        const items = text.split("<item>");
        for (const item of items) {
          const title = item.match(/<title>(.*?)<\/title>/)?.[1];
          const company = item.match(/<source>(.*?)<\/source>/)?.[1];
          const link = item.match(/<link>(.*?)<\/link>/)?.[1];
          const description = item.match(/<description>(.*?)<\/description>/)?.[1];
          if (title && company && link) {
            jobs.push({
              title: title.replace(/&amp;/g, "&").trim(),
              company: company.trim(),
              candidate_required_location: "Remote",
              url: link.trim(),
              source: "LinkedIn",
              publication_date: "Recent",
              description: stripHtml(description || "").slice(0, 300),
              tags: [],
            });
          }
        }
        return jobs;
      } catch {
        return [];
      }
    })
  );

  const all: RawJob[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all;
}

// ── Keyword relevance filter ─────────────────────────────
const ROLE_KEYWORDS = [
  "webflow", "front end", "front-end", "frontend", "ui", "ux",
  "wordpress", "react", "next.js", "nextjs", "typescript",
  "javascript", "tailwind", "product designer", "ux designer",
  "ui designer", "cms", "project manager", "scrum master", "agile",
];

function isRelevant(job: RawJob): boolean {
  const text = `${job.title} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  return ROLE_KEYWORDS.some((kw) => text.includes(kw));
}

// ── AI scoring (never returns empty array) ──────────────
async function scoreWithAI(rawJobs: RawJob[]): Promise<Job[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const toScore = rawJobs.slice(0, 15);
  const fallbackJobs: Job[] = toScore.map((j) => ({
    title: j.title,
    company: j.company_name || j.company || "Unknown",
    location: j.candidate_required_location || "Remote",
    url: j.url,
    source: j.source || "Remote",
    posted: j.publication_date
      ? new Date(j.publication_date).toLocaleDateString("en-PK", { month: "short", day: "numeric" })
      : "Recent",
    description: (j.description || "").slice(0, 300),
    skills: j.tags || [],
    match_score: 0,
    cold_message: "",
  }));

  const jobsForAI = toScore.map((j) => ({
    title: j.title,
    company: j.company_name || j.company || "Unknown",
    location: j.candidate_required_location || "Remote",
    url: j.url,
    posted: j.publication_date
      ? new Date(j.publication_date).toLocaleDateString("en-PK", { month: "short", day: "numeric" })
      : "Recent",
    description: (j.description || "").slice(0, 300),
    tags: j.tags || [],
    source: j.source || "Remote",
  }));

  const prompt = `You are a precision job matcher. Score each job against the candidate's profile below. 

CANDIDATE PROFILE:
${PROFILE}

JOBS TO SCORE (${jobsForAI.length}):
${JSON.stringify(jobsForAI, null, 1)}

FOR EACH JOB, RETURN A JSON OBJECT WITH:
{
  "title": string,
  "company": string,
  "location": string,
  "url": string,
  "source": string,
  "posted": string,
  "description": "concise role summary in your own words",
  "skills": ["skill1","skill2",...],
  "match_score": integer 0-100,
  "cold_message": "LinkedIn InMail (under 150 words) that references 2 actual projects from the candidate's profile relevant to THIS role. End with: shersial.com"
}

RULES:
- Do NOT include jobs with match_score < 40.
- Sort descending by match_score.
- Return ONLY a valid JSON array (no markdown, no backticks).
- The candidate is open to multiple roles: Webflow, Front-End, UI/UX, WordPress, and IT Project Management. Choose the most relevant role for each job.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) {
      const scored = JSON.parse(match[0]) as Job[];
      if (scored.length > 0) return scored.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    }
  } catch (err: any) {
    console.error("AI scoring failed:", err.message);
  }

  console.warn("AI scoring returned no usable data – showing raw jobs");
  return fallbackJobs;
}

// ── Main scan function (returns ALL relevant jobs) ───────
export async function scanJobs(): Promise<Job[]> {
  const [remotive, jobicy, arbeitnow, remoteok, linkedinSerp, linkedinSB] =
    await Promise.all([
      fetchRemotiveJobs(),
      fetchJobicyJobs(),
      fetchArbeitnowJobs(),
      fetchRemoteOKJobs(),
      fetchLinkedInSerpApi(),
      fetchLinkedInScrapingBee(),
    ]);

  console.log(`Remotive: ${remotive.length} jobs`);
  console.log(`Jobicy: ${jobicy.length} jobs`);
  console.log(`Arbeitnow: ${arbeitnow.length} jobs`);
  console.log(`RemoteOK: ${remoteok.length} jobs`);
  console.log(`LinkedIn (SerpApi): ${linkedinSerp.length} jobs`);
  console.log(`LinkedIn (ScrapingBee): ${linkedinSB.length} jobs`);

  let allRaw = [
    ...remotive,
    ...jobicy,
    ...arbeitnow,
    ...remoteok,
    ...linkedinSerp,
    ...linkedinSB,
  ];

  const seen = new Set<string>();
  allRaw = allRaw.filter((j) => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
  console.log(`${allRaw.length} unique jobs after dedup`);

  allRaw = allRaw.filter(isRelevant);
  console.log(`${allRaw.length} relevant jobs after filtering`);

  if (allRaw.length === 0) return [];

  const aiBatch = allRaw.slice(0, 15);
  const remaining = allRaw.slice(15);

  const scored = await scoreWithAI(aiBatch);
  const remainingJobs: Job[] = remaining.map((j) => ({
    title: j.title,
    company: j.company_name || j.company || "Unknown",
    location: j.candidate_required_location || "Remote",
    url: j.url,
    source: j.source || "Remote",
    posted: j.publication_date
      ? new Date(j.publication_date).toLocaleDateString("en-PK", { month: "short", day: "numeric" })
      : "Recent",
    description: (j.description || "").slice(0, 300),
    skills: j.tags || [],
    match_score: 0,
    cold_message: "",
  }));

  const allJobs = [...scored, ...remainingJobs];
  console.log(`Total jobs to show: ${allJobs.length} (${scored.length} scored/enriched)`);
  return allJobs;
}