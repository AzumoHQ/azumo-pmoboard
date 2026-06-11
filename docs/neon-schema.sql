CREATE TABLE IF NOT EXISTS pmo_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS pmo_snapshots (
  snapshot_date date PRIMARY KEY,
  label text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  expiring_60d jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_clients jsonb NOT NULL DEFAULT '[]'::jsonb,
  forecast jsonb NOT NULL DEFAULT '{}'::jsonb,
  forecast_total integer,
  forecast_source text,
  bench_source text,
  account_coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
  account_coverage_source text,
  bench_by_month jsonb NOT NULL DEFAULT '{}'::jsonb,
  utilization_billing_rate jsonb NOT NULL DEFAULT '{}'::jsonb,
  harvest jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  assignment_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  bench_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS bench_by_month jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS utilization_billing_rate jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS harvest jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS data_quality jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS data_lineage jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS pmo_notes (
  id text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pmo_users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS pmo_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES pmo_users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pmo_sessions_token_hash ON pmo_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_pmo_sessions_user_id ON pmo_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pmo_sessions_expires_at ON pmo_sessions(expires_at);
