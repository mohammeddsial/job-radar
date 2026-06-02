-- db/migrations/001_multi_agent_schema.sql
-- Run after your existing job_scanner schema.
-- Compatible with Postgres 14+.

-- ── Outreach Agent ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outreach_leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL CHECK (source IN ('linkedin', 'upwork')),
  name              TEXT NOT NULL,
  title             TEXT,
  company           TEXT,
  profile_url       TEXT NOT NULL,
  email             TEXT,
  connection_degree SMALLINT,
  relevance_score   SMALLINT NOT NULL DEFAULT 0,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'discovered'
                      CHECK (status IN ('discovered','message-drafted','sent','replied','converted')),
  job_lead_id       UUID REFERENCES job_leads(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES outreach_leads(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('linkedin','upwork','email')),
  subject     TEXT,
  body        TEXT NOT NULL,
  tone        TEXT NOT NULL DEFAULT 'professional',
  approved    BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at     TIMESTAMPTZ,
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON outreach_leads (status);
CREATE INDEX ON outreach_leads (relevance_score DESC);
CREATE INDEX ON outreach_messages (lead_id);

-- ── Proposal Writer ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_lead_id   UUID REFERENCES job_leads(id) ON DELETE SET NULL,
  outreach_id   UUID REFERENCES outreach_leads(id) ON DELETE SET NULL,
  style         TEXT NOT NULL CHECK (style IN ('cover-letter','upwork-proposal','email-pitch')),
  tone          TEXT NOT NULL DEFAULT 'conversational',
  highlights    TEXT[] NOT NULL DEFAULT '{}',
  word_limit    INTEGER,
  body          TEXT NOT NULL,
  subject       TEXT,
  model         TEXT NOT NULL,
  tokens_used   INTEGER NOT NULL DEFAULT 0,
  approved      BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON proposals (job_lead_id);
CREATE INDEX ON proposals (approved, submitted_at);

-- ── Social Marketing ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform         TEXT NOT NULL DEFAULT 'linkedin',
  type             TEXT NOT NULL DEFAULT 'update',
  content          TEXT NOT NULL,
  image_url        TEXT,
  hashtags         TEXT[] NOT NULL DEFAULT '{}',
  scheduled_at     TIMESTAMPTZ NOT NULL,
  published_at     TIMESTAMPTZ,
  linkedin_urn     TEXT,                        -- returned by LinkedIn API after publish
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','approved','published','failed')),
  likes            INTEGER,
  comments_count   INTEGER,
  shares           INTEGER,
  impressions      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_replies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  post_urn         TEXT,                         -- LinkedIn URN of the post
  comment_id       TEXT NOT NULL,                -- LinkedIn comment ID
  comment_author   TEXT NOT NULL,
  comment_text     TEXT NOT NULL,
  suggested_reply  TEXT NOT NULL,
  approved         BOOLEAN NOT NULL DEFAULT FALSE,
  replied_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id)                            -- prevent duplicate drafts
);

CREATE INDEX ON social_posts (status, scheduled_at);
CREATE INDEX ON social_replies (post_id, approved);

-- ── Portfolio Tracker ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url              TEXT NOT NULL,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pagespeed_score  SMALLINT,
  lcp_ms           NUMERIC(10,2),
  fid_ms           NUMERIC(10,2),
  cls_score        NUMERIC(6,4),
  backlink_count   INTEGER NOT NULL DEFAULT 0,
  alerts_json      JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS keyword_rankings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id       UUID NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  keyword           TEXT NOT NULL,
  position          SMALLINT NOT NULL,
  previous_position SMALLINT,
  url               TEXT NOT NULL,
  search_engine     TEXT NOT NULL DEFAULT 'google'
);

CREATE TABLE IF NOT EXISTS backlinks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id       UUID NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  source_url        TEXT NOT NULL,
  target_url        TEXT NOT NULL,
  anchor_text       TEXT,
  domain_authority  SMALLINT,
  discovered_at     TIMESTAMPTZ NOT NULL,
  is_new            BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX ON portfolio_snapshots (captured_at DESC);
CREATE INDEX ON keyword_rankings (snapshot_id, keyword);
CREATE INDEX ON backlinks (snapshot_id, is_new);

-- ── Telegram Approvals ────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent         TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID NOT NULL,
  message_id    INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON telegram_approvals (status, created_at DESC);
CREATE INDEX ON telegram_approvals (resource_id, resource_type);