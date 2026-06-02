// app/api/linkedin-proxy/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.JSEARCH_API_KEY;
  if (!apiKey) {
    console.warn("JSEARCH_API_KEY missing");
    return NextResponse.json({ jobs: [] });
  }

  const queries = [
    "webflow developer remote",
    "wordpress developer remote",
    "react typescript frontend remote",
    "ui ux designer remote",
    "product designer remote",
    "frontend developer remote",
    "webflow developer UAE",
    "react developer UAE",
    "next.js developer remote",
  ];

  const allJobs: any[] = [];

  for (const q of queries) {
    try {
      const url = new URL("https://jsearch.p.rapidapi.com/search");
      url.searchParams.append("query", q);
      url.searchParams.append("num_pages", "1");
      url.searchParams.append("date_posted", "week");

      const res = await fetch(url.toString(), {
        headers: {
          "x-rapidapi-key": apiKey,
          "x-rapidapi-host": "jsearch.p.rapidapi.com",
        },
        signal: AbortSignal.timeout(8000),
      });

      const data = await res.json();
      const jobs = data.data || [];

      for (const j of jobs) {
        allJobs.push({
          title: j.job_title,
          company: j.employer_name,
          location: j.job_city
            ? `${j.job_city}, ${j.job_country}`
            : j.job_is_remote
            ? "Remote"
            : j.job_country || "Remote",
          url: j.job_apply_link || j.job_google_link,
          source: j.job_publisher || "JSearch (LinkedIn/Indeed)",
          posted: j.job_posted_at_datetime_utc || "Recent",
          description: (j.job_description || "").replace(/<[^>]*>/g, " ").slice(0, 400),
          skills: j.job_required_skills || [],
        });
      }

      // Wait 300ms between queries to stay within free tier
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.warn(`JSearch error for "${q}":`, e);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = allJobs.filter((j) => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  return NextResponse.json({ jobs: unique });
}