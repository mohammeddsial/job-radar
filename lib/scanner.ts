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

// ── Fetch free job APIs (unchanged) ──────────────────────
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
  const seen = new Set<string>();
  return all.filter((j) => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
}

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

// ── Keyword relevance filter ─────────────────────────────
const ROLE_KEYWORDS = [
  "webflow",
  "front@end",
  "frontend",
  "ui",
  "ux",
  "wordpress",
  "react",
  "next.js",
  "typescript",
  "javascript",
  "tailwind",
  "product designer",
  "ux designer",
  "ui designer",
  "cms",
  "project manager",
  "scrum master",
];

function isRelevant(job: RawJob): boolean {
  const text = `${job.title} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  return ROLE_KEYWORDS.some((kw) => text.includes(kw));
}

// ── AI scoring (single call, rate‑limit safe) ────────────
async function scoreWithAI(rawJobs: RawJob[]): Promise<Job[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Take up to 15 jobs for the free tier
  const toScore = rawJobs.slice(0, 15);
  const jobsForAI = toScore.map((j) => ({
    title: j.title,
    company: j.company_name || j.company || "Unknown",
    location: j.candidate_required_location || "Remote",
    url: j.url,
    posted: j.publication_date
      ? new Date(j.publication_date).toLocaleDateString("en-PK", { month: "short", day: "numeric" })
      : "Recent",
    description: (j.description || "").replace(/<[^>]*>/g, "").slice(0, 300),
    tags: j.tags || [],
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
  "source": "Remotive",
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
      console.log(`✓ Scored ${scored.length} relevant jobs`);
      return scored.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    }
    return [];
  } catch (err: any) {
    console.error("AI scoring failed:", err.message);
    // Return raw jobs on failure (so dashboard isn't empty)
    return toScore.map((j: any) => ({
      title: j.title,
      company: j.company_name || j.company,
      location: j.candidate_required_location || "Remote",
      url: j.url,
      source: "Remotive",
      posted: j.publication_date || "Recent",
      description: j.description?.slice(0, 300) || "",
      skills: j.tags || [],
      match_score: 0,
      cold_message: "",
    }));
  }
}

// ── Main scan function ────────────────────────────────────
export async function scanJobs(): Promise<Job[]> {
  const [remotive, jobicy] = await Promise.all([fetchRemotiveJobs(), fetchJobicyJobs()]);
  let allRaw = [...remotive, ...jobicy];
  console.log(`Fetched ${allRaw.length} raw jobs`);

  // Filter out clearly irrelevant jobs
  allRaw = allRaw.filter(isRelevant);
  console.log(`Filtered to ${allRaw.length} relevant jobs`);

  if (allRaw.length === 0) return [];

  return await scoreWithAI(allRaw);
}