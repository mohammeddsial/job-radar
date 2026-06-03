// app/api/email/track/route.ts
// Handles open tracking (pixel), click tracking, and unsubscribes.
//
// Usage in emails:
//   Open pixel:   <img src="/api/email/track?campaign=ID&step=1&event=opened">
//   Click:        /api/email/track?campaign=ID&step=1&event=clicked&url=ENCODED_URL
//   Unsubscribe:  /api/email/track?campaign=ID&step=1&event=unsubscribed

import { NextResponse } from "next/server";
import { handleTrackingEvent } from "@/agents/email-campaign";

// 1x1 transparent GIF (for open tracking pixel)
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request: Request): Promise<Response> {
  const url        = new URL(request.url);
  const campaignId = url.searchParams.get("campaign") || "";
  const stepNum    = parseInt(url.searchParams.get("step") || "1", 10);
  const event      = url.searchParams.get("event") as
    "opened" | "clicked" | "replied" | "unsubscribed" | null;
  const redirectUrl = url.searchParams.get("url");

  if (campaignId && event) {
    // Fire-and-forget — don't await so pixel returns immediately
    handleTrackingEvent(campaignId, stepNum, event).catch(err =>
      console.error("[email-track]", err)
    );
  }

  // Click tracking — redirect to destination
  if (event === "clicked" && redirectUrl) {
    try {
      const dest = decodeURIComponent(redirectUrl);
      return NextResponse.redirect(dest);
    } catch {
      return NextResponse.redirect("https://warq.io");
    }
  }

  // Unsubscribe — show confirmation page
  if (event === "unsubscribed") {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>You've been unsubscribed</h2>
        <p>You won't receive any more emails from this campaign.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // Default: return transparent tracking pixel
  return new Response(TRACKING_PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}
