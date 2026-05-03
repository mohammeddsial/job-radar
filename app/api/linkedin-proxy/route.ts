// app/api/linkedin-proxy/route.ts
import { NextResponse } from "next/server";

const RSS_URLS = [
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=webflow&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=wordpress%20developer&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react%20typescript&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=frontend%20developer&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=ui%20ux%20designer&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=product%20designer&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=technical%20project%20manager&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=jira%20administrator&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=scrum%20master&location=Remote",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=webflow&location=Dubai",
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react%20developer&location=UAE",
];

export async function GET() {
  const allJobs: any[] = [];

  for (const url of RSS_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(10000),
      });
      const xml = await res.text();

      if (!xml.includes("<item>")) continue;

      const items = xml.split("<item>");
      for (const item of items) {
        const title = item.match(/<title>(.*?)<\/title>/)?.[1];
        const company = item.match(/<source>(.*?)<\/source>/)?.[1];
        const link = item.match(/<link>(.*?)<\/link>/)?.[1];
        const description = item.match(/<description>(.*?)<\/description>/)?.[1];
        if (title && company && link) {
          allJobs.push({
            title: title.replace(/&amp;/g, "&").trim(),
            company: company.trim(),
            location: "Remote",
            url: link.trim(),
            posted: "Recent",
            description: (description || "")
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 300),
          });
        }
      }
    } catch (e) {
      console.warn(`LinkedIn proxy fetch error for ${url}:`, e);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allJobs.filter((j) => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  return NextResponse.json({ jobs: unique });
}