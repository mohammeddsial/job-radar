// app/api/score-jobs/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PROFILE } from "@/lib/scanner";

export async function POST(req: Request) {
  let rawJobs: any[] = []; // ✅ Declare here so it's accessible in catch

  try {
    const body = await req.json();
    rawJobs = body.jobs || [];

    if (!rawJobs || !Array.isArray(rawJobs) || rawJobs.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY missing, returning unscored jobs");
      const unscored = rawJobs.map((j: any) => ({
        ...j,
        match_score: 0,
        cold_message: "",
      }));
      return NextResponse.json({ jobs: unscored });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // ✅ Using current model (gemini-1.5-flash)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Prepare simplified job list for the prompt
    const jobsForAI = rawJobs.map((j: any) => ({
      title: j.title || "",
      company: j.company || "",
      location: j.location || "Remote",
      description: (j.description || "").slice(0, 250),
      tags: j.skills || [],
      source: j.source || "LinkedIn",
    }));

    const prompt = `You are a precision job-to-candidate matcher for a job radar system.

CANDIDATE PROFILE:
${PROFILE}

JOBS TO EVALUATE (${jobsForAI.length} jobs):
${JSON.stringify(jobsForAI, null, 1)}

SCORING RULES:
- match_score 80-100: Direct skill + role match
- match_score 60-79: Adjacent/transferable skills
- match_score 40-59: Partial overlap
- match_score 0-39: Poor match — still include but with low score

COLD MESSAGE RULES:
- Max 130 words. Professional but direct.
- Reference 1-2 SPECIFIC projects from the profile relevant to THIS exact role.
- Mention the company name if available.
- End every message with: "Portfolio: shersial.com"
- Do NOT use generic openers like "I hope this message finds you well."

OUTPUT: Valid JSON array only. No markdown, no backticks, no preamble.
Each object: { title, company, location, url, source, posted, description, skills, match_score, cold_message }
Keep the original url and posted fields exactly as provided.
Sort by match_score descending.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error("No JSON array found in AI response");
    }

    const scoredJobs = JSON.parse(match[0]);

    // Merge back any missing fields (like url, posted) that AI might have omitted
    const enriched = scoredJobs.map((scored: any, idx: number) => ({
      ...rawJobs[idx],   // keep original fields
      ...scored,         // override with AI scores + message
    }));

    return NextResponse.json({ jobs: enriched });
  } catch (err: any) {
    console.error("Scoring error:", err.message);
    // ✅ rawJobs is now defined here (thanks to let declaration outside try)
    const fallback = (rawJobs || []).map((j: any) => ({
      ...j,
      match_score: 0,
      cold_message: "",
    }));
    return NextResponse.json({ jobs: fallback });
  }
}