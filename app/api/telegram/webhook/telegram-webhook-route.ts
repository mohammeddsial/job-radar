// api/telegram/webhook/route.ts  (Next.js App Router)
// Receives all Telegram callback queries (approval button presses)
// and routes them to the correct agent action.

import { NextRequest, NextResponse } from "next/server";
import { handleWebhookUpdate } from "../../../../telegram/bot";

// Telegram sends a secret token in the header for security
function validateTelegramRequest(req: NextRequest): boolean {
  const token = req.headers.get("x-telegram-bot-api-secret-token");
  return token === process.env.TELEGRAM_WEBHOOK_SECRET;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!validateTelegramRequest(req)) {
    // Don't return 401 — Telegram expects 200 even for ignored updates
    return NextResponse.json({ ok: true });
  }

  const body = await req.json();
  await handleWebhookUpdate(body);
  return NextResponse.json({ ok: true });
}

// ── Register webhook on startup ──────────────────────────
// Call once after deploying: POST /api/telegram/register
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-agent-secret");
  if (secret !== process.env.AGENT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/telegram/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
      }),
    }
  );

  const data = await res.json();
  return NextResponse.json(data);
}