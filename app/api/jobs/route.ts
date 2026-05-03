import { NextResponse } from "next/server";
import { loadJobs } from "@/lib/store";

export async function GET() {
  const data = loadJobs();
  if (!data) {
    return NextResponse.json({ jobs: [], lastScanned: null, count: 0 });
  }
  return NextResponse.json(data);
}
