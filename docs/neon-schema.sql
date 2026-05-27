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
  bench_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pmo_notes (
  id text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
