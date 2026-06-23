-- Weather public dashboard tables
-- weather_cache: stores latest fetched data from NWS / Open-Meteo / NHC as JSON blobs
-- weather_leads: email captures from the public /weather/ page (INSERT-only, no auth)

CREATE TABLE IF NOT EXISTS weather_cache (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key    TEXT NOT NULL UNIQUE,   -- 'alerts' | 'conditions' | 'storm' | 'forecast'
  payload      JSONB NOT NULL,
  source_url   TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weather_leads (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email        TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'weather-page',
  ip_hash      TEXT,                   -- SHA-256 of client IP for dedup, not stored raw
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS weather_leads_email_idx ON weather_leads (email);
CREATE INDEX IF NOT EXISTS weather_cache_key_idx ON weather_cache (cache_key);
CREATE INDEX IF NOT EXISTS weather_cache_fetched_idx ON weather_cache (fetched_at DESC);

-- Trigger to keep updated_at current on weather_cache
CREATE OR REPLACE FUNCTION update_weather_cache_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER weather_cache_updated_at
  BEFORE UPDATE ON weather_cache
  FOR EACH ROW EXECUTE FUNCTION update_weather_cache_timestamp();

-- RLS: weather_cache is public read (it's aggregated public data from NOAA/NWS)
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_weather_cache" ON weather_cache
  FOR SELECT USING (true);
-- Only service role can write (Edge Function uses service role key)

-- RLS: weather_leads is INSERT-only for anonymous users (no reads)
ALTER TABLE weather_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_weather_leads" ON weather_leads
  FOR INSERT WITH CHECK (true);
-- No SELECT policy for anon — only service role can read leads
