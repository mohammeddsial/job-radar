// cron/schedule.ts
// All agent cron schedules in one place.
// Works with Vercel Cron (vercel.json), or any cron service hitting your API.
//
// If using Vercel Cron, copy the "crons" array into vercel.json.
// Each path must be a GET endpoint that triggers the agent.

export const CRON_SCHEDULE = {
    // ── Job Scanner (existing) ────────────────────────────
    jobScanner: {
      schedule: "0 */4 * * *",    // Every 4 hours
      path: "/api/cron/job-scanner",
      description: "Scan LinkedIn, Upwork, Indeed for new jobs",
    },
  
    // ── Outreach Agent ────────────────────────────────────
    outreach: {
      schedule: "0 9,15 * * 1-5", // 9am and 3pm Mon–Fri
      path: "/api/cron/outreach",
      description: "Find and draft messages to new leads",
    },
  
    // ── Proposal Writer ───────────────────────────────────
    proposalWriter: {
      schedule: "30 9 * * 1-5",   // 9:30am Mon–Fri (after job scan)
      path: "/api/cron/proposals",
      description: "Draft proposals for top-scored jobs from last scan",
    },
  
    // ── Social Marketing ──────────────────────────────────
    socialPost: {
      schedule: "0 8 * * 1,3,5",  // 8am Mon, Wed, Fri
      path: "/api/cron/social-post",
      description: "Generate and schedule LinkedIn post",
    },
    socialComments: {
      schedule: "0 */2 * * *",    // Every 2 hours
      path: "/api/cron/social-comments",
      description: "Poll LinkedIn for new comments, draft replies",
    },
    weeklyContentPlan: {
      schedule: "0 8 * * 0",      // 8am Sunday
      path: "/api/cron/weekly-content-plan",
      description: "Send weekly LinkedIn content plan to Telegram",
    },
  
    // ── Portfolio Tracker ─────────────────────────────────
    portfolioDaily: {
      schedule: "0 7 * * *",      // 7am daily
      path: "/api/cron/portfolio",
      description: "Snapshot rankings, backlinks, PageSpeed",
    },
    portfolioWeekly: {
      schedule: "0 7 * * 1",      // 7am Monday
      path: "/api/cron/portfolio-compare",
      description: "Compare shersial.com against competitors",
    },
  } as const;
  
  // ── Vercel cron config (paste into vercel.json) ──────────
  export const VERCEL_CRONS = Object.values(CRON_SCHEDULE).map((c) => ({
    path: c.path,
    schedule: c.schedule,
  }));
  
  
//   vercel.json:
//   {
//     "crons": [
//       { "path": "/api/cron/job-scanner",         "schedule": "0 */4 * * *" },
//       { "path": "/api/cron/outreach",             "schedule": "0 9,15 * * 1-5" },
//       { "path": "/api/cron/proposals",            "schedule": "30 9 * * 1-5" },
//       { "path": "/api/cron/social-post",          "schedule": "0 8 * * 1,3,5" },
//       { "path": "/api/cron/social-comments",      "schedule": "0 */2 * * *" },
//       { "path": "/api/cron/weekly-content-plan",  "schedule": "0 8 * * 0" },
//       { "path": "/api/cron/portfolio",            "schedule": "0 7 * * *" },
//       { "path": "/api/cron/portfolio-compare",    "schedule": "0 7 * * 1" }
//     ]
//   }
