-- Initial OMNIwx paid-user backend schema.
-- User-controlled values must never be interpolated into SQL. All database
-- values must use Cloudflare D1 prepared statements and bind().

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_provider_id TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT,
  account_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  temperature_unit TEXT,
  wind_unit TEXT,
  pressure_unit TEXT,
  distance_unit TEXT,
  forecast_model TEXT,
  map_style TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_locations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_locations_user_updated
  ON saved_locations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS device_installations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  platform TEXT NOT NULL,
  push_token_hash TEXT,
  app_version TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_device_installations_user
  ON device_installations(user_id);

CREATE TABLE IF NOT EXISTS subscription_entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_customer_id TEXT,
  product_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  latest_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscription_entitlements_user_status
  ON subscription_entitlements(user_id, status);

CREATE TABLE IF NOT EXISTS radar_manifests (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  product TEXT NOT NULL,
  site_id TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  generated_at TEXT NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  frame_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_radar_manifests_scope_product_site_generated
  ON radar_manifests(scope, product, site_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS radar_frames (
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  frame_time INTEGER NOT NULL,
  frame_iso TEXT NOT NULL,
  path TEXT,
  tile_url TEXT,
  kind TEXT NOT NULL DEFAULT 'past',
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (manifest_id) REFERENCES radar_manifests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_radar_frames_manifest_sort
  ON radar_frames(manifest_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_radar_frames_manifest_time
  ON radar_frames(manifest_id, frame_time DESC);

CREATE TABLE IF NOT EXISTS radar_site_activity (
  site_id TEXT PRIMARY KEY,
  last_requested_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_radar_site_activity_last_requested
  ON radar_site_activity(last_requested_at DESC);
