// app/api/cron/social-comments/route.ts
import { NextResponse } from "next/server";
import { processNewComments } from "@/agents/social-marketing";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("authorization") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: Replace with real DB queries to get published posts
  // For now returns empty — wire up once social_posts table is populated
  const recentPosts: Array<{ linkedInUrn: string; content: string }> = [];
  let totalReplies = 0;

  try {
    for (const post of recentPosts) {
      const knownIds = new Set<string>(); // fetch from DB: SELECT comment_id FROM social_replies WHERE post_urn=$1
      const replies = await processNewComments(post.linkedInUrn, post.content, knownIds);
      totalReplies += replies.length;
    }
    return NextResponse.json({ ok: true, repliesDrafted: totalReplies });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
