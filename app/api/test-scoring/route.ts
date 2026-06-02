import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PROFILE } from "@/lib/scanner";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing API key" });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const testJob = {
    title: "Webflow Developer",
    company: "Tech Corp",
    description: "Looking for an expert Webflow developer to build a CMS-driven corporate site.",
  };

  const prompt = `Score this job from 0-100 based on profile. Return ONLY a number.

Profile: ${PROFILE.slice(0, 500)}

Job: ${testJob.title} at ${testJob.company}
Description: ${testJob.description}`;

  const result = await model.generateContent(prompt);
  const score = result.response.text();

  return NextResponse.json({ score });
}