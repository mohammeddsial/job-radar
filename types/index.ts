// ─────────────────────────────────────────────
// Shared types across all agents
// ─────────────────────────────────────────────

export type AgentName =
  | "job-scanner"
  | "outreach"
  | "proposal-writer"
  | "social-marketing"
  | "portfolio-tracker";

export interface AgentEvent {
  id: string;
  agent: AgentName;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

// ── Job Scanner (existing) ───────────────────
export interface JobLead {
  id: string;
  platform: "linkedin" | "upwork" | "indeed" | "other";
  title: string;
  company: string;
  url: string;
  description: string;
  budget?: string;
  postedAt: Date;
  score: number;           // Gemini-computed relevance 0-100
  tags: string[];
  status: "new" | "outreach-sent" | "proposal-sent" | "replied" | "closed";
}

// ── Outreach Agent ───────────────────────────
export interface OutreachLead {
  id: string;
  source: "linkedin" | "upwork";
  name: string;
  title: string;
  company: string;
  profileUrl: string;
  email?: string;
  connectionDegree?: 1 | 2 | 3;
  relevanceScore: number;
  notes: string;
  status: "discovered" | "message-drafted" | "sent" | "replied" | "converted";
  jobLeadId?: string;      // linked job if found via job scanner
  createdAt: Date;
  lastActivityAt: Date;
}

export interface OutreachMessage {
  id: string;
  leadId: string;
  platform: "linkedin" | "upwork" | "email";
  subject?: string;
  body: string;
  tone: "professional" | "casual" | "direct";
  approved: boolean;
  sentAt?: Date;
  repliedAt?: Date;
}

// ── Proposal Writer Agent ────────────────────
export interface ProposalRequest {
  jobLeadId: string;
  leadId?: string;
  style: "cover-letter" | "upwork-proposal" | "email-pitch";
  tone: "formal" | "conversational" | "enthusiastic";
  highlights: string[];   // skills/projects to emphasise
  wordLimit?: number;
}

export interface Proposal {
  id: string;
  jobLeadId: string;
  request: ProposalRequest;
  body: string;
  subject?: string;
  model: string;
  tokensUsed: number;
  approved: boolean;
  submittedAt?: Date;
  createdAt: Date;
}

// ── Social Marketing Agent ──────────────────
export type PostPlatform = "linkedin";

export interface SocialPost {
  id: string;
  platform: PostPlatform;
  type: "article" | "update" | "poll" | "carousel";
  content: string;
  imageUrl?: string;
  hashtags: string[];
  scheduledAt: Date;
  publishedAt?: Date;
  status: "draft" | "approved" | "published" | "failed";
  engagementStats?: {
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
  };
}

export interface SocialReply {
  id: string;
  postId: string;
  commentAuthor: string;
  commentText: string;
  suggestedReply: string;
  approved: boolean;
  repliedAt?: Date;
}

// ── Portfolio Tracker Agent ──────────────────
export interface PortfolioSnapshot {
  id: string;
  url: string;           // e.g. https://shersial.com
  capturedAt: Date;
  rankings: KeywordRanking[];
  backlinks: BacklinkRecord[];
  pagespeedScore?: number;
  coreWebVitals?: {
    lcp: number;
    fid: number;
    cls: number;
  };
  alerts: PortfolioAlert[];
}

export interface KeywordRanking {
  keyword: string;
  position: number;
  previousPosition?: number;
  url: string;
  searchEngine: "google" | "bing";
}

export interface BacklinkRecord {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  domainAuthority?: number;
  discoveredAt: Date;
  isNew: boolean;
}

export interface PortfolioAlert {
  type: "ranking-drop" | "new-backlink" | "lost-backlink" | "pagespeed-drop" | "uptime";
  severity: "info" | "warning" | "critical";
  message: string;
  data: Record<string, unknown>;
}

// ── Telegram Notification ────────────────────
export interface TelegramNotification {
  chatId: string;
  agent: AgentName;
  title: string;
  body: string;
  actions?: TelegramAction[];
}

export interface TelegramAction {
  label: string;
  callbackData: string;
}

export interface TelegramApproval {
  id: string;
  agent: AgentName;
  resourceType: "outreach-message" | "proposal" | "social-post" | "social-reply";
  resourceId: string;
  messageId: number;
  status: "pending" | "approved" | "rejected";
  respondedAt?: Date;
}


export interface KeywordRanking {
  keyword: string;
  position: number;
  previousPosition?: number;
  url: string;
  searchEngine: "google" | "bing";
}

export interface BacklinkRecord {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  domainAuthority?: number;
  discoveredAt: Date;
  isNew: boolean;
}

export interface PortfolioAlert {
  type: "ranking-drop" | "new-backlink" | "lost-backlink" | "pagespeed-drop" | "uptime";
  severity: "info" | "warning" | "critical";
  message: string;
  data: Record<string, unknown>;
}

export interface PortfolioSnapshot {
  id: string;
  url: string;
  capturedAt: Date;
  rankings: KeywordRanking[];
  backlinks: BacklinkRecord[];
  pagespeedScore?: number;
  coreWebVitals?: {
    lcp: number;
    fid: number;
    cls: number;
  };
  alerts: PortfolioAlert[];
}

// ── Agency Lead Hunter ───────────────────────
export type AgencyLeadSource =
  | "apollo"
  | "product-hunt"
  | "google-serp"
  | "crunchbase"
  | "linkedin"
  | "manual";

export type AgencyLeadStatus =
  | "discovered"
  | "email-queued"
  | "email-sent"
  | "opened"
  | "clicked"
  | "replied"
  | "meeting-booked"
  | "proposal-sent"
  | "won"
  | "lost";

export type AgencyRegion = "UAE" | "US" | "UK" | "EU" | "APAC" | "OTHER";

export interface AgencyLead {
  id: string;
  company: string;
  website: string;
  industry: string;
  companySize: "1-10" | "11-50" | "51-200" | "201-500" | "500+";
  country: string;
  region: AgencyRegion;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  contactLinkedIn?: string;
  source: AgencyLeadSource;
  painPoints: string[];
  techStack?: string[];
  fundingStage?: string;
  recommendedService?: string;  // e.g. "Webflow", "React", "UI/UX"
  relevanceScore: number;        // 0–100 AI-scored
  status: AgencyLeadStatus;
  notes?: string;
  createdAt: string;
  lastContactedAt?: string;
}

// ── Email Campaign Manager ────────────────────
export type EmailStepStatus =
  | "pending"
  | "sent"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "skipped";

export interface EmailCampaignStep {
  stepNumber: number;        // 1 = intro, 2 = follow-up, 3 = breakup
  delayDays: number;         // days after previous step
  subject: string;
  bodyHtml: string;
  bodyText: string;          // plain text fallback
  scheduledAt: string;       // ISO string
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  replied: boolean;
  status: EmailStepStatus;
  resendMessageId?: string;  // Resend API message ID
}

export interface EmailCampaign {
  id: string;
  leadId: string;
  companyName: string;
  contactEmail: string;
  contactName?: string;
  campaignType: "cold-outreach" | "follow-up" | "reactivation";
  steps: EmailCampaignStep[];
  currentStep: number;
  status: "active" | "paused" | "completed" | "unsubscribed" | "bounced";
  startedAt: string;
  completedAt?: string;
  approved: boolean;
}

export interface EmailTrackingEvent {
  id: string;
  campaignId: string;
  stepNumber: number;
  eventType: "opened" | "clicked" | "replied" | "unsubscribed" | "bounced";
  timestamp: string;
  userAgent?: string;
  clickedUrl?: string;
}
