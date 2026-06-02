// app/api/test-gemini/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is missing" }, { status: 500 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use the same model as your scoring route
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Say 'API key works'");
    const text = result.response.text();
    return NextResponse.json({ success: true, text });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}