// agents/proposal-writer/index.ts – Groq version (free, no quota issues)
import type { JobLead, Proposal, ProposalRequest } from "../../types";
import { requestApproval } from "../../telegram/bot";
import { publishEvent } from "../../lib/queue";
import { PROFILE } from "@/lib/scanner";

// agents/proposal-writer/index.ts – modify only the context section
const PORTFOLIO_CONTEXT = `
Name: Shersial
My websites:
- shersial.com (main portfolio)
- warq.io (another project)
- getdesign.io (design service platform)
Specialities: Full-stack web development, UI/UX design, Next.js, React, TypeScript, Node.js, Tailwind CSS
Tone: Confident, specific, no buzzwords, results-focused
`.trim();

// Groq API call helper
async function callGroq(prompt: string, system?: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

  const messages: any[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function enrichJobDescription(job: JobLead): Promise<string> {
  if (job.description.length > 800) return job.description;
  try {
    const res = await fetch(job.url);
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    return text || job.description;
  } catch {
    return job.description;
  }
}

async function draftProposal(job: JobLead, description: string, request: ProposalRequest): Promise<string> {
  const prompt = `You are a senior proposal writer. Use this profile: ${PORTFOLIO_CONTEXT}

Write a ${request.tone} ${request.style} for this job. Max ${request.wordLimit ?? 300} words.

JOB: ${job.title} at ${job.company}
BUDGET: ${job.budget ?? "unspecified"}
DESCRIPTION:
${description}

Rules:
- Open with the client's problem, not your credentials
- Use concrete numbers if possible
- No generic phrases like "I am passionate"
- End with a clear CTA
- Return ONLY the proposal body, no extra text.`;

  return callGroq(prompt);
}

async function critiqueAndRefine(draft: string, job: JobLead): Promise<string> {
  const prompt = `Review this proposal draft for "${job.title}":
${draft}

Critique:
1. Does it open with the client's problem?
2. Any filler phrases? (list them)
3. Is the CTA specific?

Then rewrite an improved version.

Return JSON: {"critique": "...", "improved": "..."}`;

  const result = await callGroq(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json|```/g, "").trim());
    return parsed.improved ?? draft;
  } catch {
    return draft;
  }
}

async function generateSubject(job: JobLead, proposal: string): Promise<string> {
  const prompt = `Write a short email subject line (max 60 chars) for a proposal to "${job.title}" at "${job.company}". Proposal excerpt: ${proposal.slice(0, 200)}. Return ONLY the subject line.`;
  const result = await callGroq(prompt);
  return result.replace(/^["']|["']$/g, "").slice(0, 60);
}

export async function runProposalWriter(job: JobLead, request: ProposalRequest): Promise<Proposal> {
  console.log(`[proposal-writer] Drafting for: ${job.title}`);
  const description = await enrichJobDescription(job);
  const draft = await draftProposal(job, description, request);
  const refined = await critiqueAndRefine(draft, job);
  const subject = (request.style === "cover-letter" || request.style === "email-pitch")
    ? await generateSubject(job, refined)
    : undefined;

  const proposal: Proposal = {
    id: crypto.randomUUID(),
    jobLeadId: job.id,
    request,
    body: refined,
    subject,
    model: "llama-3.3-70b-versatile",
    tokensUsed: 0,
    approved: false,
    createdAt: new Date(),
  };

  const preview = [
    `💼 *${job.title}* @ ${job.company}`,
    `💰 Budget: ${job.budget ?? "unspecified"}`,
    subject ? `📧 Subject: ${subject}` : "",
    "",
    proposal.body,
  ].filter(Boolean).join("\n");

  await requestApproval({
    agent: "proposal-writer",
    resourceType: "proposal",
    resourceId: proposal.id,
    preview,
  });

  await publishEvent("proposal", {
    agent: "proposal-writer",
    type: "proposal-ready",
    payload: { proposal, job },
  });

  return proposal;
}

export async function processJobQueue(jobs: JobLead[], defaultRequest: Omit<ProposalRequest, "jobLeadId">): Promise<void> {
  const topJobs = jobs
    .filter(j => j.status === "new" && (j.score ?? 0) >= 70)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);

  for (const job of topJobs) {
    await runProposalWriter(job, { ...defaultRequest, jobLeadId: job.id });
    await new Promise(r => setTimeout(r, 2000));
  }
}

export async function generateProposal(job: any): Promise<string> {
  const prompt = `Write a short, tailored cover letter for this job. Use the candidate profile below.

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${(job.description || "").slice(0, 500)}

CANDIDATE PROFILE:
${PROFILE.slice(0, 1500)}

RULES:
- Max 150 words.
- Reference ONE specific project from the profile that matches this job.
- Mention the company name.
- End with "Portfolio: shersial.com"
- No generic openers like "I hope this message finds you well."

Return ONLY the proposal text, no extra commentary.`;

  return callGroq(prompt);
}

export async function regenerateWithFeedback(
  originalProposal: Proposal,
  job: JobLead,
  feedback: string
): Promise<Proposal> {
  const prompt = `Here is a proposal draft:

${originalProposal.body}

User feedback: "${feedback}"

Rewrite the proposal incorporating this feedback. Keep what works, fix what was criticised. Return ONLY the new proposal body, no extra text.`;

  const newBody = await callGroq(prompt);

  return {
    ...originalProposal,
    id: crypto.randomUUID(),
    body: newBody,
    approved: false,
  };
}