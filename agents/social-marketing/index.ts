// agents/social-marketing/index.ts – Groq version (free)
import type { SocialPost, SocialReply } from "../../types";
import { requestApproval, sendNotification } from "../../telegram/bot";
import { publishEvent } from "../../lib/queue";

const PERSON_ID = process.env.LINKEDIN_PERSON_ID ?? "";
const LINKEDIN_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN ?? "";

// Groq API helper
async function callGroq(prompt: string, system?: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");
  const messages: any[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// Content calendar
const CONTENT_PILLARS = [
  { topic: "Technical insight", prompt: "Share a non-obvious technical lesson you learned recently as a web developer. Make it actionable." },
  { topic: "Project showcase", prompt: "Write about a recent project (from shersial.com), focusing on the problem solved, not the tech used." },
  { topic: "Industry observation", prompt: "Share a genuine opinion about the state of web development / design / freelancing in 2025. Avoid hot takes for their own sake." },
  { topic: "Behind the scenes", prompt: "Write a post about your process, tools, or how you structure your freelance work day." },
  { topic: "Client story", prompt: "Write an anonymised story about solving a tricky client problem. Make it relatable to other devs." },
];

export async function generateLinkedInPost(topicIndex?: number): Promise<{ content: string; hashtags: string[] }> {
  const pillar = CONTENT_PILLARS[topicIndex ?? Math.floor(Math.random() * CONTENT_PILLARS.length)];
  const system = `You are a content strategist for Shersial, a freelance web developer and designer (shersial.com).
You write LinkedIn posts that feel authentic and get engagement — not corporate, not generic.
Style: conversational, specific, no buzzwords. Use line breaks for readability.
Never start with "I'm excited to share" or "Thrilled to announce" or emoji at the very start.`;
  const userPrompt = `Write a LinkedIn post on this topic: "${pillar.topic}"
Prompt: ${pillar.prompt}

Format your response as JSON:
{
  "content": "<the full post text — 150-300 words, natural line breaks>",
  "hashtags": ["tag1", "tag2", "tag3"]  // 3-5 relevant hashtags, no # prefix
}`;
  const text = await callGroq(userPrompt, system);
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  return { content: parsed.content, hashtags: parsed.hashtags ?? [] };
}

export async function schedulePost(scheduledAt: Date, topicIndex?: number): Promise<SocialPost> {
  const { content, hashtags } = await generateLinkedInPost(topicIndex);
  const post: SocialPost = {
    id: crypto.randomUUID(), platform: "linkedin", type: "update", content, hashtags,
    scheduledAt, status: "draft",
  };
  const fullContent = `${content}\n\n${hashtags.map(h => `#${h}`).join(" ")}`;
  await requestApproval({
    agent: "social-marketing", resourceType: "social-post", resourceId: post.id,
    preview: `📅 Scheduled: ${scheduledAt.toLocaleDateString()}\n\n${fullContent.slice(0, 600)}`,
  });
  await publishEvent("social", { agent: "social-marketing", type: "post-ready", payload: { post } });
  return post;
}

export async function publishPost(post: SocialPost): Promise<void> {
  const text = `${post.content}\n\n${post.hashtags.map(h => `#${h}`).join(" ")}`;
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST", headers: { Authorization: `Bearer ${LINKEDIN_TOKEN}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
      author: `urn:li:person:${PERSON_ID}`, lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text }, shareMediaCategory: "NONE" } },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn publish failed: ${await res.text()}`);
  console.log(`[social] Published post: ${(await res.json()).id}`);
}

// Comments & replies
interface LinkedInComment { id: string; actor: string; message: { text: string }; created: { time: number }; }
async function fetchRecentComments(postUrn: string): Promise<LinkedInComment[]> {
  const res = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments`, {
    headers: { Authorization: `Bearer ${LINKEDIN_TOKEN}`, "X-Restli-Protocol-Version": "2.0.0" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.elements ?? [];
}

export async function draftReply(comment: LinkedInComment, postContent: string): Promise<string> {
  const system = `You are Shersial, a web developer. You reply to LinkedIn comments on your posts in a warm, genuine way. 
Keep replies concise (1-3 sentences). Engage with the actual content. Don't be sycophantic. Never say "Great question!".`;
  const userPrompt = `Post context: "${postContent.slice(0, 300)}"\n\nComment: "${comment.message.text}"\n\nWrite a reply.`;
  return callGroq(userPrompt, system);
}

export async function processNewComments(postUrn: string, postContent: string, knownCommentIds: Set<string>): Promise<SocialReply[]> {
  const comments = await fetchRecentComments(postUrn);
  const newComments = comments.filter(c => !knownCommentIds.has(c.id));
  const replies: SocialReply[] = [];
  for (const comment of newComments) {
    const suggestedReply = await draftReply(comment, postContent);
    const reply: SocialReply = {
      id: crypto.randomUUID(), postId: postUrn, commentAuthor: comment.actor,
      commentText: comment.message.text, suggestedReply, approved: false,
    };
    await requestApproval({
      agent: "social-marketing", resourceType: "social-reply", resourceId: reply.id,
      preview: `💬 *${comment.actor}* commented:\n"${comment.message.text}"\n\n✏️ Suggested reply:\n${suggestedReply}`,
    });
    replies.push(reply);
    await publishEvent("social", { agent: "social-marketing", type: "reply-ready", payload: { reply } });
  }
  return replies;
}

export async function postReply(reply: SocialReply, postUrn: string): Promise<void> {
  await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments`, {
    method: "POST", headers: { Authorization: `Bearer ${LINKEDIN_TOKEN}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({ actor: `urn:li:person:${PERSON_ID}`, message: { text: reply.suggestedReply } }),
  });
}

export async function sendWeeklyContentPlan(): Promise<void> {
  const days = ["Monday", "Wednesday", "Friday"];
  const plans = await Promise.all(days.map(async (day, i) => {
    const { content } = await generateLinkedInPost(i % CONTENT_PILLARS.length);
    return `*${day}:*\n${content.slice(0, 120)}…`;
  }));
  await sendNotification({
    chatId: process.env.TELEGRAM_CHAT_ID ?? "", agent: "social-marketing",
    title: "📅 This week's LinkedIn content plan", body: plans.join("\n\n"),
    actions: [{ label: "✅ Approve all", callbackData: "social:approve-week" }, { label: "✏️ Edit", callbackData: "social:edit-week" }],
  });
}

export async function fetchPostEngagement(postUrn: string): Promise<{ likes: number; comments: number; shares: number; impressions: number }> {
  const res = await fetch(`https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(postUrn)}`, {
    headers: { Authorization: `Bearer ${LINKEDIN_TOKEN}`, "X-Restli-Protocol-Version": "2.0.0" },
  });
  if (!res.ok) return { likes: 0, comments: 0, shares: 0, impressions: 0 };
  const data = await res.json();
  const stats = data.elements?.[0]?.totalShareStatistics ?? {};
  return { likes: stats.likeCount ?? 0, comments: stats.commentCount ?? 0, shares: stats.shareCount ?? 0, impressions: stats.impressionCount ?? 0 };
}