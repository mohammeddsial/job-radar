// agents/email-campaign/index.ts
// ─────────────────────────────────────────────────────────────────
// AGENT 2 — COLD EMAIL CAMPAIGN MANAGER
//
// What it does:
//   1. Picks up leads from the Agency Lead Hunter with emails
//   2. Researches each company (website copy, recent news)
//   3. Uses Groq to write a 3-email sequence personalised to THAT company
//   4. Sends Email 1 immediately (after Telegram approval)
//   5. Auto-schedules follow-ups (Day 3, Day 7)
//   6. Pings you on Telegram when someone opens, clicks, or replies
//   7. Drafts a reply for every inbound reply
//
// Required env vars:
//   GROQ_API_KEY          — already in your project
//   RESEND_API_KEY        — resend.com (free: 100 emails/day)
//   FROM_EMAIL            — e.g. zahid@warq.io (must be verified in Resend)
//   FROM_NAME             — e.g. "Zahid | Warq Agency"
//   NEXT_PUBLIC_URL       — your Vercel URL for tracking pixels
//   TELEGRAM_CHAT_ID      — already in your project
// ─────────────────────────────────────────────────────────────────

import type { AgencyLead, EmailCampaign, EmailCampaignStep } from "../../types";
import { requestApproval, sendNotification } from "../../telegram/bot";
import { publishEvent } from "../../lib/queue";
import { getLeadsForEmail, updateLead } from "../../lib/lead-store";
import {
  saveEmailCampaign,
  loadCampaignById,
  updateCampaignStep,
  getPendingFollowUps,
  saveTrackingEvent,
  loadEmailCampaigns,
} from "../../lib/email-store";

const FROM_EMAIL  = process.env.FROM_EMAIL  || "hello@warq.io";
const FROM_NAME   = process.env.FROM_NAME   || "Zahid | Warq Agency";
const BASE_URL    = process.env.NEXT_PUBLIC_URL || "https://yourapp.vercel.app";

// ── Sender identity ──────────────────────────────────────────────
const SENDER_CONTEXT = `
Your name: Zahid Sher Sial
Your agency: Warq Digital (warq.io)
Your portfolio: shersial.com
16 years building websites and digital products.

Key portfolio projects to reference:
- Al Ghurair Exchange (bilingual Webflow, 195 countries, live currency API)
- Cohrus HRMS (React + TypeScript enterprise HR dashboard)  
- SEDD Government Portal (100K+ citizens, Arabic/English, +35% task completion)
- Juke Audio (Webflow e-commerce, 40% support ticket reduction)
- Edarat Group (WordPress + Redis, high-performance document management)

Writing rules:
- Always write as "I" (first person), never "we" unless referring to client and you
- Max 180 words per email — mobile-first reading
- No buzzwords: "synergy", "leverage", "passionate", "excited to share"
- Never start with "I hope this email finds you well"
- Be specific: mention THEIR company name, THEIR specific problem
- One CTA per email — make it easy to say yes
- Warm but professional tone, never salesy
`.trim();

// ── Groq helper ──────────────────────────────────────────────────
async function callGroq(prompt: string, jsonMode = true): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// ── Company research ─────────────────────────────────────────────
// Fetches and summarises the company's homepage to personalise emails
async function researchCompany(website: string): Promise<string> {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return "";

    const html = await res.text();
    // Strip HTML and grab first 1500 chars of visible text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);

    return text;
  } catch {
    return "";
  }
}

// ── 3-Email sequence generator ──────────────────────────────────
// Each email has a different goal:
//   Email 1 (Day 0)  — Hook. Show you understand their pain. End with soft CTA.
//   Email 2 (Day 3)  — Value. Share a case study relevant to their industry. New CTA.
//   Email 3 (Day 7)  — Breakup. Short, human, no pressure. Leave the door open.
export async function generateEmailSequence(
  lead: AgencyLead,
  siteContent?: string
): Promise<Pick<EmailCampaignStep, "subject" | "bodyHtml" | "bodyText">[]> {
  const context = `
Lead details:
Company: ${lead.company}
Website: ${lead.website}
Industry: ${lead.industry}
Country/Region: ${lead.country || lead.region}
Contact: ${lead.contactName || "the founder"} (${lead.contactTitle || "decision-maker"})
Pain points: ${lead.painPoints.join(", ") || "needs better web presence"}
Recommended service: ${lead.recommendedService || "Web Development"}
Pitch angle: ${lead.notes || ""}

What we know from their website:
${(siteContent || "").slice(0, 600)}

${SENDER_CONTEXT}
`;

  const prompt = `${context}

Write a cold email sequence of 3 emails for this prospect. 

EMAIL 1 — Cold intro (Day 0):
Goal: Get a reply or a click. Open by naming their specific pain/opportunity.
Max 150 words. End with: "Would it make sense to have a quick 20-minute call this week?"

EMAIL 2 — Follow-up (Day 3, if no reply):
Goal: Add value without asking for much. Reference a result from a similar project.
Max 130 words. End with a different CTA — offer a free audit or a specific insight.

EMAIL 3 — Breakup (Day 7, if no reply):
Goal: Get any response. Keep it to 3–4 sentences. Assume they're busy, not uninterested.
Max 80 words. CTA: "Just a yes or no — still relevant?"

For each email, return:
- subject: compelling subject line (max 55 chars, no ALL CAPS, no spammy words)
- bodyText: plain text version
- bodyHtml: HTML version with <p> tags, <strong> for key phrases, <a> for the CTA

Return JSON:
{
  "emails": [
    { "subject": "...", "bodyText": "...", "bodyHtml": "..." },
    { "subject": "...", "bodyText": "...", "bodyHtml": "..." },
    { "subject": "...", "bodyText": "...", "bodyHtml": "..." }
  ]
}`;

  try {
    const result = await callGroq(prompt);
    const parsed = JSON.parse(result.replace(/```json|```/g, "").trim());
    return (parsed.emails || []).slice(0, 3);
  } catch (err) {
    console.error("[email-campaign] Sequence generation error:", err);
    // Fallback sequence
    return [
      {
        subject: `Quick thought on ${lead.company}'s website`,
        bodyText: `Hi ${lead.contactName?.split(" ")[0] || "there"},\n\nI came across ${lead.company} and noticed an opportunity to improve ${lead.painPoints[0] || "your web presence"}.\n\nI've helped similar companies in ${lead.industry} achieve measurable results. Would it make sense to have a quick 20-minute call this week?\n\nBest,\nZahid\nwarq.io`,
        bodyHtml: `<p>Hi ${lead.contactName?.split(" ")[0] || "there"},</p><p>I came across <strong>${lead.company}</strong> and noticed an opportunity to improve ${lead.painPoints[0] || "your web presence"}.</p><p>I've helped similar companies in ${lead.industry} achieve measurable results.</p><p>Would it make sense to have a quick 20-minute call this week?</p><p>Best,<br>Zahid<br><a href="https://warq.io">warq.io</a></p>`,
      },
      {
        subject: `Case study: ${lead.industry} redesign → +35% conversions`,
        bodyText: `Hi ${lead.contactName?.split(" ")[0] || "there"},\n\nFollowing up on my last note. I thought this might be relevant: I recently helped a company in ${lead.industry} rebuild their site on Webflow — their conversions improved by 35% and support tickets dropped 40%.\n\nI'd love to do a free 15-minute audit of ${lead.company}'s site and share what I find. No strings.\n\nWorth it?\nZahid`,
        bodyHtml: `<p>Hi ${lead.contactName?.split(" ")[0] || "there"},</p><p>Following up on my last note. I thought this might be relevant: I recently helped a company in <strong>${lead.industry}</strong> rebuild their site — conversions improved by <strong>35%</strong> and support tickets dropped 40%.</p><p>I'd love to do a free 15-minute audit of ${lead.company}'s site and share what I find. No strings.</p><p>Worth it?<br>Zahid</p>`,
      },
      {
        subject: `Still relevant for ${lead.company}?`,
        bodyText: `Hi ${lead.contactName?.split(" ")[0] || "there"},\n\nI know your inbox is busy. Just a yes or no — is improving ${lead.company}'s web presence something on your radar for this quarter?\n\nEither way, no hard feelings.\nZahid | warq.io`,
        bodyHtml: `<p>Hi ${lead.contactName?.split(" ")[0] || "there"},</p><p>I know your inbox is busy. Just a yes or no — is improving <strong>${lead.company}</strong>'s web presence something on your radar for this quarter?</p><p>Either way, no hard feelings.</p><p>Zahid | <a href="https://warq.io">warq.io</a></p>`,
      },
    ];
  }
}

// ── Resend email sender ──────────────────────────────────────────
interface SendEmailParams {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  campaignId: string;
  stepNumber: number;
}

export async function sendEmailViaResend(params: SendEmailParams): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email-campaign] RESEND_API_KEY missing — email not sent");
    return null;
  }

  // Inject tracking pixel into HTML (invisible 1x1 image)
  const trackingPixel = `<img src="${BASE_URL}/api/email/track?campaign=${params.campaignId}&step=${params.stepNumber}&event=opened" width="1" height="1" alt="" style="display:none" />`;
  
  // Wrap body with basic email template + tracking
  const htmlWithTracking = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${params.bodyHtml}
  <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
  <p style="font-size:12px;color:#999">
    You're receiving this because you were identified as a potential fit for our services.
    <a href="${BASE_URL}/api/email/track?campaign=${params.campaignId}&step=${params.stepNumber}&event=unsubscribed" style="color:#999">Unsubscribe</a>
  </p>
  ${trackingPixel}
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [params.to],
        subject: params.subject,
        html: htmlWithTracking,
        text: params.bodyText,
        tags: [
          { name: "campaign_id", value: params.campaignId },
          { name: "step", value: String(params.stepNumber) },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[email-campaign] Resend error:", err);
      return null;
    }

    const data = await res.json();
    return data.id as string;
  } catch (err) {
    console.error("[email-campaign] Send error:", err);
    return null;
  }
}

// ── Create & queue a new campaign ───────────────────────────────
async function createCampaignForLead(lead: AgencyLead): Promise<EmailCampaign | null> {
  if (!lead.contactEmail) return null;

  // Research the company website
  const siteContent = await researchCompany(lead.website);

  // Generate 3-email sequence
  const emailDrafts = await generateEmailSequence(lead, siteContent);
  if (emailDrafts.length === 0) return null;

  const now = new Date();
  const DELAYS = [0, 3, 7]; // days between each email

  const steps: EmailCampaignStep[] = emailDrafts.map((draft, i) => {
    const scheduledAt = new Date(now.getTime() + DELAYS[i] * 86400000);
    return {
      stepNumber: i + 1,
      delayDays: DELAYS[i],
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      bodyText: draft.bodyText,
      scheduledAt: scheduledAt.toISOString(),
      replied: false,
      status: i === 0 ? "pending" : "pending", // all pending until sent
    };
  });

  const campaign: EmailCampaign = {
    id: crypto.randomUUID(),
    leadId: lead.id,
    companyName: lead.company,
    contactEmail: lead.contactEmail,
    contactName: lead.contactName,
    campaignType: "cold-outreach",
    steps,
    currentStep: 1,
    status: "active",
    startedAt: now.toISOString(),
    approved: false,
  };

  return campaign;
}

// ── Send a single campaign step ──────────────────────────────────
async function sendStep(campaign: EmailCampaign, step: EmailCampaignStep): Promise<boolean> {
  const messageId = await sendEmailViaResend({
    to: campaign.contactEmail,
    subject: step.subject,
    bodyHtml: step.bodyHtml,
    bodyText: step.bodyText,
    campaignId: campaign.id,
    stepNumber: step.stepNumber,
  });

  if (!messageId) return false;

  updateCampaignStep(campaign.id, step.stepNumber, {
    status: "sent",
    sentAt: new Date().toISOString(),
    resendMessageId: messageId,
  });

  console.log(`[email-campaign] ✉️  Sent step ${step.stepNumber} to ${campaign.contactEmail} (${campaign.companyName})`);
  return true;
}

// ────────────────────────────────────────────────────────────────────
// MAIN RUNNER — create and send new campaigns
// Call this after the Lead Hunter has run
// ────────────────────────────────────────────────────────────────────
export interface EmailCampaignConfig {
  dailyLimit?: number;       // max new campaigns to start today
  requireApproval?: boolean; // send to Telegram before first email
}

export async function runEmailCampaigns(config: EmailCampaignConfig = {}): Promise<void> {
  const { dailyLimit = 10, requireApproval = true } = config;

  console.log("[email-campaign] 📧 Starting email campaign runner...");

  // 1. Pick up leads waiting for email outreach
  const leads = getLeadsForEmail().slice(0, dailyLimit);
  console.log(`[email-campaign] ${leads.length} leads queued for email outreach`);

  let started = 0;
  for (const lead of leads) {
    try {
      const campaign = await createCampaignForLead(lead);
      if (!campaign) continue;

      // Preview for Telegram approval
      const preview = [
        `📧 *${lead.company}* — ${lead.relevanceScore}/100`,
        `To: ${lead.contactEmail}`,
        `🎯 ${lead.recommendedService || "Web Dev"} | ${lead.painPoints[0] || ""}`,
        ``,
        `Email 1 — "${campaign.steps[0].subject}"`,
        campaign.steps[0].bodyText.slice(0, 300),
        `...`,
        ``,
        `Sequence: Day 0 → Day 3 → Day 7`,
      ].join("\n");

      if (requireApproval) {
        // Send to Telegram for approval before emailing
        await requestApproval({
          agent: "outreach",
          resourceType: "outreach-message",
          resourceId: campaign.id,
          preview,
        });

        // Save campaign (approval will trigger sending via webhook)
        saveEmailCampaign(campaign);
        updateLead(lead.id, { status: "email-queued", lastContactedAt: new Date().toISOString() });
      } else {
        // Auto-send without approval
        saveEmailCampaign(campaign);
        const sent = await sendStep(campaign, campaign.steps[0]);
        if (sent) {
          updateLead(lead.id, { status: "email-sent", lastContactedAt: new Date().toISOString() });
          started++;
        }
      }

      await new Promise(r => setTimeout(r, 1000)); // stagger sends
    } catch (err) {
      console.error(`[email-campaign] Error for ${lead.company}:`, err);
    }
  }

  console.log(`[email-campaign] ${started} campaigns started`);
}

// ────────────────────────────────────────────────────────────────────
// FOLLOW-UP RUNNER — processes scheduled follow-up emails
// Run this every few hours via cron
// ────────────────────────────────────────────────────────────────────
export async function processFollowUps(): Promise<void> {
  console.log("[email-campaign] Processing follow-up emails...");

  const pending = getPendingFollowUps();
  console.log(`[email-campaign] ${pending.length} follow-ups due`);

  for (const { campaign, step } of pending) {
    try {
      // Skip if lead has already replied
      if (campaign.steps.some(s => s.replied)) {
        updateCampaignStep(campaign.id, step.stepNumber, { status: "skipped" });
        continue;
      }

      const sent = await sendStep(campaign, step);
      if (sent) {
        // Update campaign step index
        const updatedCampaign = loadCampaignById(campaign.id);
        if (updatedCampaign) {
          updatedCampaign.currentStep = step.stepNumber + 1;
          if (step.stepNumber === 3) {
            updatedCampaign.status = "completed";
            updatedCampaign.completedAt = new Date().toISOString();
          }
          saveEmailCampaign(updatedCampaign);
        }
      }

      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[email-campaign] Follow-up error for ${campaign.companyName}:`, err);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// APPROVAL HANDLER — called when you approve in Telegram
// ────────────────────────────────────────────────────────────────────
export async function handleCampaignApproval(campaignId: string, approved: boolean): Promise<void> {
  const campaign = loadCampaignById(campaignId);
  if (!campaign) return;

  if (!approved) {
    saveEmailCampaign({ ...campaign, status: "paused" });
    console.log(`[email-campaign] Campaign ${campaignId} rejected`);
    return;
  }

  // Send the first email
  const firstStep = campaign.steps.find(s => s.stepNumber === 1);
  if (!firstStep) return;

  const sent = await sendStep({ ...campaign, approved: true }, firstStep);

  if (sent) {
    saveEmailCampaign({ ...campaign, approved: true });
    updateLead(campaign.leadId, {
      status: "email-sent",
      lastContactedAt: new Date().toISOString(),
    });

    await sendNotification({
      chatId: process.env.TELEGRAM_CHAT_ID ?? "",
      agent: "outreach",
      title: `✉️ Email sent to ${campaign.companyName}`,
      body: `To: ${campaign.contactEmail}\nSubject: ${firstStep.subject}\n\nFollow-ups scheduled Day 3 & Day 7 automatically.`,
    });
  }
}

// ────────────────────────────────────────────────────────────────────
// ENGAGEMENT HANDLER — called from tracking webhook
// ────────────────────────────────────────────────────────────────────
export async function handleTrackingEvent(
  campaignId: string,
  stepNumber: number,
  eventType: "opened" | "clicked" | "replied" | "unsubscribed"
): Promise<void> {
  const campaign = loadCampaignById(campaignId);
  if (!campaign) return;

  const now = new Date().toISOString();
  const step = campaign.steps.find(s => s.stepNumber === stepNumber);

  // Save the event
  saveTrackingEvent({
    id: crypto.randomUUID(),
    campaignId,
    stepNumber,
    eventType,
    timestamp: now,
  });

  // Update step
  if (eventType === "opened" && step && !step.openedAt) {
    updateCampaignStep(campaignId, stepNumber, { openedAt: now, status: "opened" });
    updateLead(campaign.leadId, { status: "opened" });

    // Alert on first open
    await sendNotification({
      chatId: process.env.TELEGRAM_CHAT_ID ?? "",
      agent: "outreach",
      title: `👀 ${campaign.companyName} opened your email`,
      body: `Step ${stepNumber} opened\nTo: ${campaign.contactEmail}\nSubject: ${step?.subject}`,
      actions: [
        { label: "📞 Book a call", callbackData: `campaign:call:${campaignId}` },
        { label: "✍️ Send now", callbackData: `campaign:sendnow:${campaignId}` },
      ],
    });
  }

  if (eventType === "clicked") {
    updateCampaignStep(campaignId, stepNumber, { clickedAt: now, status: "clicked" });
    updateLead(campaign.leadId, { status: "clicked" });

    await sendNotification({
      chatId: process.env.TELEGRAM_CHAT_ID ?? "",
      agent: "outreach",
      title: `🔗 ${campaign.companyName} clicked a link!`,
      body: `Hot lead — they clicked in Email ${stepNumber}.\nContact: ${campaign.contactEmail}`,
    });
  }

  if (eventType === "replied") {
    updateCampaignStep(campaignId, stepNumber, { replied: true, status: "replied" });
    saveEmailCampaign({ ...campaign, status: "completed", completedAt: now });
    updateLead(campaign.leadId, { status: "replied" });

    // Draft a reply suggestion
    const replySuggestion = await draftReplyResponse(campaign);

    await sendNotification({
      chatId: process.env.TELEGRAM_CHAT_ID ?? "",
      agent: "outreach",
      title: `🎉 REPLY from ${campaign.companyName}!`,
      body: [
        `${campaign.contactEmail} replied to your email.`,
        ``,
        `💬 Suggested reply:`,
        replySuggestion,
      ].join("\n"),
      actions: [
        { label: "✅ Use this reply", callbackData: `campaign:reply:${campaignId}` },
        { label: "✏️ Edit reply",     callbackData: `campaign:editreply:${campaignId}` },
      ],
    });
  }

  if (eventType === "unsubscribed") {
    saveEmailCampaign({ ...campaign, status: "unsubscribed", completedAt: now });
    updateLead(campaign.leadId, { status: "lost" });
  }
}

// ── Draft a follow-up reply suggestion ──────────────────────────
async function draftReplyResponse(campaign: EmailCampaign): Promise<string> {
  const prompt = `You're Zahid from Warq Agency. Someone from ${campaign.companyName} just replied to your cold email.

Write a warm, brief reply that:
1. Thanks them for responding
2. Suggests a 20-minute discovery call (offer 2 specific time slots this week)
3. Confirms your expertise is relevant to their likely need
4. Max 100 words

Return ONLY the email body, no subject line.`;

  try {
    return await callGroq(prompt, false);
  } catch {
    return `Hi,\n\nThanks for getting back to me!\n\nWould you be free for a quick 20-minute call this Thursday or Friday? Happy to share some ideas specific to ${campaign.companyName}.\n\nBest,\nZahid\nwarq.io`;
  }
}

// ── Weekly campaign report ────────────────────────────────────────
export async function sendWeeklyEmailReport(): Promise<void> {
  const campaigns = loadEmailCampaigns();
  const lastWeek = new Date(Date.now() - 7 * 86400000);

  const recent = campaigns.filter(c => new Date(c.startedAt) >= lastWeek);
  const opened  = recent.filter(c => c.steps.some(s => s.openedAt)).length;
  const replied = recent.filter(c => c.steps.some(s => s.replied)).length;
  const rate    = recent.length > 0 ? Math.round((opened / recent.length) * 100) : 0;

  await sendNotification({
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    agent: "outreach",
    title: "📊 Weekly Email Campaign Report",
    body: [
      `*This week's outreach:*`,
      `📤 Sent: ${recent.length} campaigns`,
      `👀 Opened: ${opened} (${rate}% open rate)`,
      `💬 Replied: ${replied}`,
      ``,
      `Overall:`,
      `Total campaigns: ${campaigns.length}`,
      `Active: ${campaigns.filter(c => c.status === "active").length}`,
    ].join("\n"),
  });
}

export { generateEmailSequence as previewEmailSequence };
