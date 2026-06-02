// lib/scanner.ts
// import type { Job as JobType } from "@/types"; // optional, but we define locally too

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

export const PROFILE = `
Zahid Sher Sial — Senior Full-Stack Designer & Developer | 16+ Years
Location: Lahore, Pakistan | Open to: UAE / GCC / Remote | Portfolio: shersial.com

═══ ROLE TARGETS (match jobs in ANY of these categories) ═══
1. Webflow Developer / CMS Specialist
2. Senior Front-End Developer (React / Next.js)
3. Senior UI/UX Designer / Product Designer
4. WordPress Developer
5. IT Project Manager / Jira Administrator / Scrum Master

═══ TECHNICAL SKILLS ═══
WEBFLOW (Expert, Certified):
  • CMS Collections, Dynamic Pages, Symbols, Custom Interactions
  • Finsweet, MemberStack, GSAP ScrollTrigger animations
  • E-Commerce, RTL/LTR bilingual builds, Custom Code injection
  • 15+ live production sites

FRONT-END (Expert):
  • React.js, Next.js, TypeScript, JavaScript (ES6+)
  • Tailwind CSS, Shadcn UI, CSS Modules, SCSS, Bootstrap
  • Vite, GSAP, REST APIs, GitHub Actions CI/CD
  • HTML5, CSS3, Angular, Flutter (mobile)
  • Lighthouse 90+ desktop / 80+ mobile

CMS PLATFORMS (Expert):
  • WordPress: Custom themes from scratch, Elementor, WPBakery, Divi
  • WooCommerce, ACF, Custom Post Types, WP Rocket, Redis, Nginx, Yoast SEO
  • Wix Studio, Wix CMS, Wix Velo (Custom JS APIs), Dynamic Pages
  • Framer, Joomla, Liferay DXP (enterprise)

UI/UX & PRODUCT DESIGN (Expert):
  • Figma (Design Systems, Auto Layout, Variants, Tokens, Dev Mode)
  • Adobe XD, Photoshop, Illustrator, InVision, Zeplin, FigJam, Miro
  • User Research, Wireframing, Prototyping, Usability Testing
  • Human-Centered Design, Design Thinking, Jobs-to-be-Done
  • iOS (HIG) + Android (Material Design) mobile app design
  • Complex enterprise dashboards, data-heavy interfaces
  • Bilingual Arabic/English RTL design for GCC/MENA

PROJECT MANAGEMENT (Expert):
  • Jira Software, Jira Service Management, Confluence
  • Custom workflows, permission schemes, JQL dashboards, EasyBI
  • ScriptRunner (Groovy automation), Jira Advanced Roadmaps
  • Agile/Scrum, Kanban, SAFe, sprint planning, retrospectives
  • Capacity planning, velocity tracking, stakeholder reporting

DOMAIN EXPERTISE: Banking, Fintech, Government, Real Estate, E-Commerce, SaaS, Fitness
REGIONS: UAE/GCC, MENA, UK, US, Pakistan
LANGUAGES: English (Fluent), Arabic (Native), Urdu/Hindi (Native)

═══ NOTABLE PROJECTS (reference in cold messages) ═══
- Al Ghurair Exchange (Webflow + RTL): Bilingual corporate platform, 195+ countries, live currency API, branch locator
- Cohrus HRMS (React + TypeScript + Shadcn): Enterprise HR platform, role-based dashboards, complex data tables
- SEDD Government Portal (Liferay DXP): 100K+ citizens, bilingual Arabic/English, task-completion +35%
- Juke Audio (Webflow E-Commerce): CMS product catalogue, support tickets reduced 40%
- Edarat Group (WordPress + Redis + WP Rocket): Document management, high-performance optimisation
- Tecbrix.com, MVK Education, FitSpot, Quote-That (Webflow CMS sites)
- MOHRE Kiosk (Android UI/UX): Government self-service platform
- Gnomen CMS + Property Management System (UK real estate)

═══ ACHIEVEMENTS ═══
- 32+ delivered projects across UAE, UK, US, Pakistan
- 35% improvement in user task-completion rates (SEDD)
- 40% reduction in support tickets (Juke Audio)
- Led teams of 5+ designers/developers
- Managed 15+ concurrent client projects (TecBrix)

CERTIFICATIONS: Webflow Layouts (Webflow University), Front-End Dev (Meta), Liferay DXP (Udemy), Adobe Certified Expert
`.trim();

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return "Recent";
  try {
    return new Date(dateStr).toLocaleDateString("en-PK", { month: "short", day: "numeric" });
  } catch {
    return "Recent";
  }
}

// ── 1. Remotive ─────────────────────────────────────────────────────────────
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
      fetch(url, { headers: { "User-Agent": "JobRadar/1.0" }, signal: AbortSignal.timeout(8000) })
        .then((r) => r.json())
        .then((d) => (d.jobs || []) as RawJob[])
    )
  );
  const all: RawJob[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all.map((j) => ({ ...j, source: "Remotive" }));
}

// ── 2. Jobicy ───────────────────────────────────────────────────────────────
async function fetchJobicyJobs(): Promise<RawJob[]> {
  try {
    const res = await fetch(
      "https://jobicy.com/api/v2/remote-jobs?count=20&tag=frontend,webflow,wordpress,ui-ux-designer",
      { headers: { "User-Agent": "JobRadar/1.0" }, signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    return ((data.jobs || []) as RawJob[]).map((j) => ({ ...j, source: "Jobicy" }));
  } catch {
    return [];
  }
}

// ── 3. Arbeitnow ───────────────────────────────────────────────────────────
async function fetchArbeitnowJobs(): Promise<RawJob[]> {
  try {
    const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
      headers: { "User-Agent": "JobRadar/1.0" },
      signal: AbortSignal.timeout(8000),
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
      description: stripHtml(j.description || "").slice(0, 400),
      tags: j.tags || [],
      source: "Arbeitnow",
    }));
  } catch {
    return [];
  }
}

// ── 4. RemoteOK ────────────────────────────────────────────────────────────
async function fetchRemoteOKJobs(): Promise<RawJob[]> {
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "JobRadar/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const data: any[] = await res.json();
    return data
      .filter((item: any) => item.slug && item.position)
      .map((j: any) => ({
        title: j.position || "",
        company_name: j.company || "",
        candidate_required_location: j.location || "Remote",
        url: j.apply_url || j.url || "",
        publication_date: j.date ? new Date(j.date).toISOString() : undefined,
        description: stripHtml(j.description || "").slice(0, 400),
        tags: j.tags || [],
        source: "RemoteOK",
      }));
  } catch {
    return [];
  }
}

// ── 5. WeWorkRemotely RSS ──────────────────────────────────────────────────
async function fetchWWRJobs(): Promise<RawJob[]> {
  const feeds = [
    "https://weworkremotely.com/categories/remote-design-jobs.rss",
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  ];
  const all: RawJob[] = [];
  await Promise.allSettled(
    feeds.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "JobRadar/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        const xml = await res.text();
        const items = xml.split("<item>");
        for (const item of items.slice(1)) {
          const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
            || item.match(/<title>(.*?)<\/title>/)?.[1];
          const link = item.match(/<link>(.*?)<\/link>/)?.[1]
            || item.match(/<guid>(.*?)<\/guid>/)?.[1];
          const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
            || item.match(/<description>(.*?)<\/description>/)?.[1];
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
          const companyRaw = item.match(/<region><!\[CDATA\[(.*?)\]\]><\/region>/)?.[1] || "";
          if (title && link) {
            const parts = title.split(" at ");
            all.push({
              title: parts[0]?.trim() || title,
              company_name: parts[1]?.trim() || companyRaw || "Unknown",
              candidate_required_location: "Remote",
              url: link.trim(),
              publication_date: pubDate,
              description: stripHtml(desc || "").slice(0, 400),
              tags: [],
              source: "WeWorkRemotely",
            });
          }
        }
      } catch {}
    })
  );
  return all;
}

// ── 6. Himalayas ─────────────────────────────────────────────────────────
async function fetchHimalayasJobs(): Promise<RawJob[]> {
  const searches = ["webflow", "wordpress", "frontend", "ui-ux"];
  const all: RawJob[] = [];
  await Promise.allSettled(
    searches.map(async (tag) => {
      try {
        const res = await fetch(`https://himalayas.app/jobs/api?q=${tag}&limit=10`, {
          headers: { "User-Agent": "JobRadar/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        const jobs = data.jobs || data;
        if (!Array.isArray(jobs)) return;
        for (const j of jobs) {
          all.push({
            title: j.title || j.role || "",
            company_name: j.company?.name || j.companyName || "",
            candidate_required_location: "Remote",
            url: j.applicationLink || j.url || `https://himalayas.app/jobs/${j.slug || ""}`,
            publication_date: j.createdAt || j.publishedAt,
            description: stripHtml(j.description || j.summary || "").slice(0, 400),
            tags: j.skills || j.tags || [],
            source: "Himalayas",
          });
        }
      } catch {}
    })
  );
  return all;
}

// ── 7. JSearch via RapidAPI ─────────────────────────────────────────────
async function fetchJSearchJobs(): Promise<RawJob[]> {
  const apiKey = process.env.JSEARCH_API_KEY;
  if (!apiKey) return [];

  const queries = [
    "webflow developer remote",
    "wordpress developer remote",
    "react typescript frontend remote",
    "ui ux designer remote",
    "product designer remote",
    "technical project manager remote",
    "jira administrator remote",
    "webflow developer UAE",
    "frontend developer UAE",
  ];

  const jobs: RawJob[] = [];
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q)}&num_pages=1&date_posted=week`,
        {
          headers: {
            "X-RapidAPI-Key": apiKey,
            "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      const data = await res.json();
      for (const j of data.data || []) {
        jobs.push({
          title: j.job_title,
          company_name: j.employer_name,
          candidate_required_location: j.job_city
            ? `${j.job_city}, ${j.job_country}`
            : j.job_is_remote
            ? "Remote"
            : j.job_country,
          url: j.job_apply_link || j.job_google_link,
          publication_date: j.job_posted_at_datetime_utc,
          description: stripHtml(j.job_description || "").slice(0, 500),
          tags: j.job_required_skills || [],
          source: j.job_publisher || "JSearch",
        });
      }
    } catch (e) {
      console.warn(`JSearch error for "${q}":`, e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return jobs;
}

// ── 8. Adzuna ───────────────────────────────────────────────────────────
async function fetchAdzunaJobs(): Promise<RawJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const searches = [
    { what: "webflow developer", where: "worldwide" },
    { what: "wordpress developer", where: "worldwide" },
    { what: "react typescript developer", where: "worldwide" },
    { what: "ui ux designer", where: "worldwide" },
    { what: "product designer", where: "worldwide" },
    { what: "frontend developer", where: "worldwide" },
    { what: "project manager jira", where: "worldwide" },
    { what: "webflow developer", where: "dubai" },
    { what: "ui ux designer", where: "dubai" },
  ];

  const jobs: RawJob[] = [];
  for (const { what, where } of searches) {
    try {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: "10",
        what,
        where,
        content_type: "application/json",
        sort_by: "date",
        max_days_old: "14",
      });
      const country = where === "dubai" ? "ae" : "gb";
      const res = await fetch(
        `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      for (const j of data.results || []) {
        jobs.push({
          title: j.title,
          company_name: j.company?.display_name,
          candidate_required_location: j.location?.display_name || where,
          url: j.redirect_url,
          publication_date: j.created,
          description: stripHtml(j.description || "").slice(0, 500),
          tags: j.category?.tag ? [j.category.tag] : [],
          source: "Adzuna",
        });
      }
    } catch (e) {
      console.warn(`Adzuna error:`, e);
    }
  }
  return jobs;
}

// ── 9. LinkedIn via SERP API (optional) ───────────────────────────────────
async function fetchLinkedInSerpApi(): Promise<RawJob[]> {
  return [];
}

// ── 10. LinkedIn via ScrapingBee (optional) ────────────────────────────────
async function fetchLinkedInScrapingBee(): Promise<RawJob[]> {
  return [];
}

// ── Keyword relevance filter ───────────────────────────────────────────────
const ROLE_KEYWORDS = [
  "webflow", "front end", "front-end", "frontend", "ui", "ux",
  "wordpress", "react", "next.js", "nextjs", "typescript",
  "javascript", "tailwind", "product designer", "ux designer",
  "ui designer", "cms", "figma", "elementor", "woocommerce",
  "project manager", "scrum master", "agile", "web designer",
];

function isRelevant(job: RawJob): boolean {
  const text = `${job.title} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  return ROLE_KEYWORDS.some((kw) => text.includes(kw));
}

// ── Groq AI scoring (replaces Gemini) ──────────────────────────────────────
async function scoreWithAI(rawJobs: RawJob[]): Promise<Job[]> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.warn("GROQ_API_KEY missing, returning unscored jobs");
    return rawJobs.map((j) => ({
      title: j.title,
      company: j.company_name || j.company || "Unknown",
      location: j.candidate_required_location || "Remote",
      url: j.url,
      source: j.source || "Remote",
      posted: formatDate(j.publication_date),
      description: (j.description || "").slice(0, 250),
      skills: j.tags || [],
      match_score: 0,
      cold_message: "",
    }));
  }

  const toScore = rawJobs.slice(0, 30);
  const jobsForAI = toScore.map((j) => ({
    title: j.title,
    company: j.company_name || j.company || "Unknown",
    description: (j.description || "").slice(0, 250),
    tags: (j.tags || []).slice(0, 5),
  }));

  const prompt = `You are a job matcher. Score each job 0-100 and write a short cold message (max 130 words) referencing one specific project from the profile.

Candidate profile:
${PROFILE.substring(0, 2000)}

Jobs (array):
${JSON.stringify(jobsForAI, null, 2)}

Return a JSON array with objects: { title, company, match_score, cold_message }
- match_score: number 0-100
- cold_message: short, personal, ends with "Portfolio: shersial.com"
- Only include jobs with match_score >= 40
- No markdown, no extra text.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // fast & free
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error:", errText);
      throw new Error(`Groq error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error("Empty Groq response");

    // Parse JSON – may be wrapped in ```json ... ```
    let cleaned = content.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    const parsed = JSON.parse(cleaned);

    // Expect either array or object with "jobs" key
    let scoredJobs = Array.isArray(parsed) ? parsed : parsed.jobs || [];

    // Merge with original data to fill missing fields
    const result: Job[] = [];
    for (let i = 0; i < toScore.length; i++) {
      const original = toScore[i];
      const scored = scoredJobs.find((s: any) => s.title === original.title) || {};
      result.push({
        title: original.title,
        company: original.company_name || original.company || "Unknown",
        location: original.candidate_required_location || "Remote",
        url: original.url,
        source: original.source || "Remote",
        posted: formatDate(original.publication_date),
        description: (original.description || "").slice(0, 250),
        skills: original.tags || [],
        match_score: scored.match_score ?? 0,
        cold_message: scored.cold_message ?? "",
      });
    }
    return result.filter(j => j.match_score >= 40);
  } catch (err: any) {
    console.error("Groq scoring failed:", err.message);
    // Fallback: return unscored jobs
    return toScore.map((j) => ({
      title: j.title,
      company: j.company_name || j.company || "Unknown",
      location: j.candidate_required_location || "Remote",
      url: j.url,
      source: j.source || "Remote",
      posted: formatDate(j.publication_date),
      description: (j.description || "").slice(0, 250),
      skills: j.tags || [],
      match_score: 0,
      cold_message: "",
    }));
  }
}

// ── Main export ────────────────────────────────────────────────────────────
export async function scanJobs(): Promise<Job[]> {
  console.log("Starting job scan from all sources...");

  const [remotive, jobicy, arbeitnow, remoteok, wwr, himalayas, jsearch, adzuna] =
    await Promise.all([
      fetchRemotiveJobs(),
      fetchJobicyJobs(),
      fetchArbeitnowJobs(),
      fetchRemoteOKJobs(),
      fetchWWRJobs(),
      fetchHimalayasJobs(),
      fetchJSearchJobs(),
      fetchAdzunaJobs(),
    ]);

  let allRaw = [
    ...remotive,
    ...jobicy,
    ...arbeitnow,
    ...remoteok,
    ...wwr,
    ...himalayas,
    ...jsearch,
    ...adzuna,
  ];

  console.log(`Remotive: ${remotive.length}`);
  console.log(`Jobicy: ${jobicy.length}`);
  console.log(`Arbeitnow: ${arbeitnow.length}`);
  console.log(`RemoteOK: ${remoteok.length}`);
  console.log(`WeWorkRemotely: ${wwr.length}`);
  console.log(`Himalayas: ${himalayas.length}`);
  console.log(`JSearch: ${jsearch.length}`);
  console.log(`Adzuna: ${adzuna.length}`);

  const seen = new Set<string>();
  allRaw = allRaw.filter((j) => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
  console.log(`${allRaw.length} unique jobs after dedup`);

  allRaw = allRaw.filter(isRelevant);
  console.log(`${allRaw.length} relevant jobs after filter`);

  if (allRaw.length === 0) return [];

  const aiBatch = allRaw.slice(0, 30);
  const remainder = allRaw.slice(30);

  const scored = await scoreWithAI(aiBatch);

  const remainderJobs: Job[] = remainder.map((j) => ({
    title: j.title,
    company: j.company_name || j.company || "Unknown",
    location: j.candidate_required_location || "Remote",
    url: j.url,
    source: j.source || "Remote",
    posted: formatDate(j.publication_date),
    description: (j.description || "").slice(0, 250),
    skills: j.tags || [],
    match_score: 0,
    cold_message: "",
  }));

  const result = [...scored, ...remainderJobs];
  console.log(`Total: ${result.length} jobs (${scored.length} AI-scored)`);
  return result;
}