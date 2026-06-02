// telegram/bot.ts
// Central Telegram helper — send notifications & collect approvals.
// Used by all agents to surface drafts to you before sending.

import type { TelegramNotification, TelegramApproval, TelegramAction } from "../types";

const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// ── Low-level Telegram API call ────────────────────────
async function tgCall<T>(method: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram API error: ${JSON.stringify(json)}`);
  return json.result;
}

// ── Send a plain notification ──────────────────────────
export async function sendNotification(n: TelegramNotification): Promise<number> {
  const text = `*[${n.agent.toUpperCase()}]* ${n.title}\n\n${n.body}`;
  const keyboard = n.actions
    ? {
        inline_keyboard: [n.actions.map((a: TelegramAction) => ({
          text: a.label,
          callback_data: a.callbackData,
        }))],
      }
    : undefined;

  const msg = await tgCall<{ message_id: number }>("sendMessage", {
    chat_id: n.chatId || CHAT_ID,
    text,
    parse_mode: "Markdown",
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });

  return msg.message_id;
}

// ── Send an approval request and wait for response ────
// Returns true = approved, false = rejected.
// Stores pending approval in DB (you hook up webhook → updateApproval).
export async function requestApproval(params: {
  agent: TelegramApproval["agent"];
  resourceType: TelegramApproval["resourceType"];
  resourceId: string;
  preview: string;        // text shown in Telegram
  chatId?: string;
}): Promise<{ messageId: number; approvalId: string }> {
  const approvalId = crypto.randomUUID();

  const messageId = await sendNotification({
    chatId: params.chatId || CHAT_ID,
    agent: params.agent,
    title: `Approval needed: ${params.resourceType}`,
    body: params.preview,
    actions: [
      { label: "✅ Approve", callbackData: `approve:${approvalId}` },
      { label: "❌ Reject",  callbackData: `reject:${approvalId}` },
    ],
  });

  // Persist in DB so the webhook handler can match callback_data → resource
  await persistApproval({
    id: approvalId,
    agent: params.agent,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    messageId,
    status: "pending",
  });

  return { messageId, approvalId };
}

// ── Webhook handler — call from your POST /api/telegram/webhook ──
export async function handleWebhookUpdate(body: {
  callback_query?: {
    id: string;
    data: string;
    message: { message_id: number };
  };
}): Promise<void> {
  const cq = body.callback_query;
  if (!cq) return;

  const [action, approvalId] = cq.data.split(":");
  if (!approvalId) return;

  const approval = await loadApproval(approvalId);
  if (!approval || approval.status !== "pending") return;

  const approved = action === "approve";
  await updateApproval(approvalId, approved ? "approved" : "rejected");

  // Acknowledge the button click
  await tgCall("answerCallbackQuery", {
    callback_query_id: cq.id,
    text: approved ? "✅ Approved!" : "❌ Rejected",
  });

  // Edit the message so it can't be double-clicked
  await tgCall("editMessageReplyMarkup", {
    chat_id: CHAT_ID,
    message_id: cq.message.message_id,
    reply_markup: {
      inline_keyboard: [[{ text: approved ? "✅ Approved" : "❌ Rejected", callback_data: "done" }]],
    },
  });

  // Emit event so the waiting agent can proceed
  const { publishEvent } = await import("../lib/queue");
  await publishEvent("telegram", {
    agent: approval.agent,
    type: "approval-response",
    payload: {
      approvalId,
      resourceType: approval.resourceType,
      resourceId: approval.resourceId,
      approved,
    },
  });
}

// ── Persistence stubs (replace with your DB calls) ────
async function persistApproval(a: TelegramApproval): Promise<void> {
  // INSERT INTO telegram_approvals ...
  console.log("[telegram] persisting approval", a.id);
}

async function loadApproval(id: string): Promise<TelegramApproval | null> {
  // SELECT * FROM telegram_approvals WHERE id = $1
  console.log("[telegram] loading approval", id);
  return null; // replace with real DB call
}

async function updateApproval(id: string, status: "approved" | "rejected"): Promise<void> {
  // UPDATE telegram_approvals SET status = $2, responded_at = NOW() WHERE id = $1
  console.log("[telegram] updating approval", id, status);
}