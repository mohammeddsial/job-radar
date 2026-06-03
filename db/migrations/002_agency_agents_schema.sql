-- db/migrations/002_agency_agents_schema.sql
-- Run after 001_multi_agent_schema.sql
-- Two new agents: Global Lead Hunter + Email Campaign Manager
-- Compatible with Postgres 14+

-- ── Agency Lead Hunter ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agency_leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company info
  company             TEXT NOT NULL,
  website             TEXT NOT NULL,
  industry            TEXT,
  company_size        TEXT CHECK (company_size IN ('1-10','11-50','51-200','201-500','500+')),
  country             TEXT,
  region              TEXT CHECK (region IN ('UAE','US','UK','EU','APAC','OTHER')),

  -- Contact info
  contact_name        TEXT,
  contact_title       TEXT,
  contact_email       TEXT,
  contact_linkedin    TEXT,

  -- Lead metadata
  source              TEXT NOT NULL
                        CHECK (source IN ('apollo','product-hunt','google-serp','crunchbase','linkedin','manual')),
  pain_points         TEXT[]  NOT NULL DEFAULT '{}',
  tech_stack          TEXT[]  NOT NULL DEFAULT '{}',
  funding_stage       TEXT,
  recommended_service TEXT,
  relevance_score     SMALLINT NOT NULL DEFAULT 0,
  notes               TEXT,

  -- Pipeline status
  status              TEXT NOT NULL DEFAULT 'discovered'
                        CHECK (status IN (
                          'discovered','email-queued','email-sent',
                          'opened','clicked','replied',
                          'meeting-booked','proposal-sent','won','lost'
                        )),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_contacted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agency_leads_status       ON agency_leads (status);
CREATE INDEX IF NOT EXISTS agency_leads_score        ON agency_leads (relevance_score DESC);
CREATE INDEX IF NOT EXISTS agency_leads_region       ON agency_leads (region);
CREATE INDEX IF NOT EXISTS agency_leads_contact_email ON agency_leads (contact_email)
  WHERE contact_email IS NOT NULL;

-- ── Email Campaign Manager ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL REFERENCES agency_leads(id) ON DELETE CASCADE,
  company_name      TEXT NOT NULL,
  contact_email     TEXT NOT NULL,
  contact_name      TEXT,
  campaign_type     TEXT NOT NULL DEFAULT 'cold-outreach'
                      CHECK (campaign_type IN ('cold-outreach','follow-up','reactivation')),
  current_step      SMALLINT NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','completed','unsubscribed','bounced')),
  approved          BOOLEAN NOT NULL DEFAULT FALSE,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS email_campaign_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  step_number         SMALLINT NOT NULL,             -- 1, 2, 3
  delay_days          SMALLINT NOT NULL DEFAULT 0,   -- days after step 1
  subject             TEXT NOT NULL,
  body_html           TEXT NOT NULL,
  body_text           TEXT NOT NULL,
  scheduled_at        TIMESTAMPTZ NOT NULL,
  sent_at             TIMESTAMPTZ,
  opened_at           TIMESTAMPTZ,
  clicked_at          TIMESTAMPTZ,
  replied             BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending','sent','opened','clicked','replied','bounced','skipped'
                        )),
  resend_message_id   TEXT,                           -- Resend API message ID
  UNIQUE (campaign_id, step_number)
);

CREATE INDEX IF NOT EXISTS email_campaign_steps_campaign  ON email_campaign_steps (campaign_id);
CREATE INDEX IF NOT EXISTS email_campaign_steps_scheduled ON email_campaign_steps (scheduled_at)
  WHERE status = 'pending';

-- ── Email Tracking Events ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_tracking_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  step_number     SMALLINT NOT NULL,
  event_type      TEXT NOT NULL
                    CHECK (event_type IN ('opened','clicked','replied','unsubscribed','bounced')),
  user_agent      TEXT,
  clicked_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_events_campaign ON email_tracking_events (campaign_id, created_at DESC);

-- ── Helpful views ─────────────────────────────────────────────────

-- Active pipeline: leads with their email campaign status
CREATE OR REPLACE VIEW agency_pipeline AS
SELECT
  al.id,
  al.company,
  al.contact_email,
  al.region,
  al.relevance_score,
  al.recommended_service,
  al.status                         AS lead_status,
  ec.id                             AS campaign_id,
  ec.status                         AS campaign_status,
  ec.current_step,
  COUNT(DISTINCT ete.id)            AS total_events,
  MAX(ete.created_at)               AS last_event_at
FROM agency_leads al
LEFT JOIN email_campaigns    ec  ON ec.lead_id    = al.id
LEFT JOIN email_tracking_events ete ON ete.campaign_id = ec.id
GROUP BY al.id, ec.id
ORDER BY al.relevance_score DESC;

-- Weekly performance summary
CREATE OR REPLACE VIEW email_weekly_stats AS
SELECT
  DATE_TRUNC('week', ec.started_at) AS week,
  COUNT(DISTINCT ec.id)             AS campaigns_started,
  COUNT(DISTINCT CASE WHEN ete.event_type = 'opened'  THEN ec.id END) AS opened,
  COUNT(DISTINCT CASE WHEN ete.event_type = 'clicked' THEN ec.id END) AS clicked,
  COUNT(DISTINCT CASE WHEN ete.event_type = 'replied' THEN ec.id END) AS replied,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN ete.event_type = 'opened' THEN ec.id END)
    / NULLIF(COUNT(DISTINCT ec.id), 0), 1
  )                                 AS open_rate_pct
FROM email_campaigns ec
LEFT JOIN email_tracking_events ete ON ete.campaign_id = ec.id
GROUP BY 1
ORDER BY 1 DESC;
