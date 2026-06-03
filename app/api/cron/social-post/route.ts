// app/api/cron/social-post/route.ts
import { NextResponse } from "next/server";
import { schedulePost } from "@/agents/social-marketing";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("authorization") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scheduledAt = new Date();
    scheduledAt.setHours(10, 0, 0, 0); // 10am
    const post = await schedulePost(scheduledAt);
    return NextResponse.json({ ok: true, postId: post.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
