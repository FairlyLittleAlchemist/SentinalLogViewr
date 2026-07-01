ALTER TABLE incident_analysis
  ALTER COLUMN techniques       TYPE jsonb USING array_to_json(techniques)::jsonb,
  ALTER COLUMN tactics          TYPE jsonb USING array_to_json(tactics)::jsonb;