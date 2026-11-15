-- Commercial/account tables added before live auth or billing is enabled.
-- Apply to development only after inspecting the live schema. Production
-- migration requires an explicit release decision and a tested rollback/export.

CREATE TABLE IF NOT EXISTS subscription_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  environment TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_customer_id TEXT,
  user_id TEXT,
  event_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  processed_at TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_event
  ON subscription_events(user_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_events_status_created
  ON subscription_events(processing_status, created_at ASC);

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_at TEXT NOT NULL,
  identity_deleted_at TEXT,
  profile_deleted_at TEXT,
  completed_at TEXT,
  failure_code TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_status_requested
  ON account_deletion_requests(status, requested_at ASC);
