# Agency Lead System — Setup Guide

Two new agents that run on top of your existing Job Radar project.

---

## What Was Built

| Agent | What It Does | Runs |
|---|---|---|
| **Global Agency Lead Hunter** | Finds companies worldwide that need your services | 6am Mon–Fri |
| **Cold Email Campaign Manager** | Sends personalised 3-email sequences, tracks opens/replies | 7am Mon–Fri + every 3hr |

### Full cron schedule (all 7 agents combined)

```
05:00  Daily job scan        /api/scan
06:00  Hunt agency leads     /api/cron/agency-leads
07:00  Start email campaigns /api/cron/email-campaigns?action=send
07:00  Portfolio snapshot    /api/cron/portfolio
*/3hr  Process follow-ups    /api/cron/email-campaigns?action=followups
*/2hr  Social comments       /api/cron/social-comments
09:00  Proposals             /api/cron/proposals
09:00  Mon: Weekly report    /api/cron/email-campaigns?action=weekly-report
09:15  Outreach              /api/cron/outreach
08:00  Social posts          /api/cron/social-post  (Mon/Wed/Fri)
08:00  Weekly content plan   /api/cron/weekly-content-plan  (Sun)
07:00  Competitor compare    /api/cron/portfolio-compare  (Mon)
```

---

## Step 1 — Copy new files into your project

```
agents/agency-lead-hunter/index.ts   → copy as-is
agents/email-campaign/index.ts       → copy as-is
lib/lead-store.ts                    → copy as-is
lib/email-store.ts                   → copy as-is
app/api/agency/route.ts              → copy as-is
app/api/cron/agency-leads/route.ts   → copy as-is
app/api/cron/email-campaigns/route.ts→ copy as-is
app/api/email/track/route.ts         → copy as-is
app/agency/page.tsx                  → copy as-is (new dashboard)
```

Also replace/update these existing files:
```
app/api/cron/outreach/route.ts          → was empty, now filled
app/api/cron/portfolio-compare/route.ts → was empty, now filled
app/api/cron/social-post/route.ts       → was empty, now filled
app/api/cron/social-comments/route.ts   → was empty, now filled
app/api/cron/weekly-content-plan/route.ts → was empty, now filled
vercel.json                             → updated with all crons
.env.example                            → updated with all vars
```

Append `types-additions.ts` content to the bottom of `types/index.ts`.

---

## Step 2 — Get API keys (priority order)

### Must-have (agents won't run without these)

| Key | Where | Cost |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com | Free |
| `RESEND_API_KEY` | resend.com/api-keys | Free (100/day) |
| `FROM_EMAIL` | Must be a domain verified in Resend | — |

### High value (add these first)

| Key | Where | Free Tier |
|---|---|---|
| `HUNTER_API_KEY` | hunter.io/api-keys | 25 searches/month |
| `SERPAPI_KEY` | serpapi.com | 100 searches/month |
| `APOLLO_API_KEY` | app.apollo.io → Settings → API | 50 exports/month |

### Optional

| Key | Where | Notes |
|---|---|---|
| `PRODUCT_HUNT_TOKEN` | producthunt.com/v2/oauth | Free, good for startup leads |
| `RESEND_WEBHOOK_SECRET` | Resend dashboard → Webhooks | For delivery events |

---

## Step 3 — Verify your sending domain in Resend

1. Go to [resend.com](https://resend.com) → Domains → Add Domain
2. Add `warq.io` (or whichever domain you want to send from)
3. Add the DNS records they give you (SPF, DKIM, DMARC)
4. Wait ~10 min for verification
5. Set `FROM_EMAIL=zahid@warq.io` in `.env.local`

> ⚠️ Emails sent from unverified domains go to spam. This step is critical.

---

## Step 4 — Run DB migration

```sql
-- In your Postgres DB:
\i db/migrations/002_agency_agents_schema.sql
```

If you don't have Postgres yet, the agents use **file-based storage** (`/tmp/agency-leads.json`, `/tmp/email-campaigns.json`) automatically. Zero setup needed.

---

## Step 5 — Deploy to Vercel

```bash
vercel --prod
```

Vercel auto-picks up the crons from `vercel.json`.

> Note: Vercel crons require a Pro plan ($20/month). On free tier, trigger manually or use an external cron service (cron-job.org is free).

---

## Step 6 — Manual test

Test each agent individually:

```bash
# 1. Test lead hunter (finds ~25 leads)
curl "https://your-app.vercel.app/api/cron/agency-leads?authorization=my-super-secret-2026"

# 2. Test email campaigns (picks up leads with emails, sends to Telegram for approval)
curl "https://your-app.vercel.app/api/cron/email-campaigns?action=send&authorization=my-super-secret-2026"

# 3. Test follow-ups (sends Day 3 and Day 7 emails when due)
curl "https://your-app.vercel.app/api/cron/email-campaigns?action=followups&authorization=my-super-secret-2026"
```

Visit your dashboard at: `https://your-app.vercel.app/agency`

---

## How the approval flow works

```
Lead Hunter runs at 6am
        ↓
Finds 20–25 companies globally
        ↓
AI scores each one (Groq)
        ↓
Hunter.io finds decision-maker emails
        ↓
Email Campaign Agent runs at 7am
        ↓
Generates personalised 3-email sequence per company
        ↓
Sends preview to YOUR Telegram: "Approve / Reject"
        ↓
You approve → Email 1 goes out immediately
        ↓
Day 3: Follow-up auto-sent (no approval needed)
Day 7: Breakup email auto-sent
        ↓
They open → Telegram alert
They click → Telegram alert 🔥
They reply → Telegram alert 🎉 + AI-drafted response
```

---

## Email sequence structure

| Email | Day | Goal | Length |
|---|---|---|---|
| Cold intro | 0 | Get a reply — name their specific problem | ≤150 words |
| Case study | 3 | Add value — share a relevant result | ≤130 words |
| Breakup | 7 | Get any response, leave door open | ≤80 words |

All emails are personalised using:
- Company name and contact's first name
- Their industry and country
- Their specific pain points (AI-identified)
- A relevant portfolio project from your profile
- Your pitch angle (why YOU specifically for THEM)

---

## Lead sources explained

| Source | What it finds | Quality |
|---|---|---|
| **Apollo.io** | Decision-makers at companies matching your ideal client profile | ⭐⭐⭐⭐⭐ |
| **Product Hunt** | Newly launched startups — they have budget and need a website | ⭐⭐⭐⭐ |
| **Google SERP** | Companies actively searching for web agencies | ⭐⭐⭐ |

Apollo is the most valuable — it lets you target by industry, size, title, and location. The UAE/GCC query specifically targets bilingual site opportunities (your biggest differentiator).

---

## Dashboard

Visit `/agency` to see:
- All leads with scores, status, pain points
- Per-lead actions: Find Email, Queue for Campaign, Dismiss
- Email campaign pipeline with step-level status
- Stats: total leads, open rate, reply rate

---

## Customise targeting

Edit `APOLLO_SEARCH_CONFIGS` in `agents/agency-lead-hunter/index.ts`:

```typescript
// Add your own target profiles:
{
  person_titles: ["Head of Digital", "E-commerce Manager"],
  num_employees_ranges: ["51,200"],
  industries: ["Retail", "Fashion", "Luxury"],
  person_locations: ["United Kingdom"],
},
```

Edit `SERP_QUERIES` in the same file to add more buying-intent search queries.

---

## Expected results (realistic)

| Metric | Benchmark |
|---|---|
| Leads found per day | 15–25 |
| Leads with emails | 40–60% |
| Email campaigns per day | 8–12 |
| Open rate (cold) | 25–40% |
| Reply rate (cold) | 3–8% |
| Meetings per month | 2–6 |

Cold email is a numbers game. The AI personalisation significantly improves these numbers vs generic templates.
