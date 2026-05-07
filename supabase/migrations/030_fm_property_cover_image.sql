-- Migration 030: FM property cover image
-- Adds a cover_image_url column to fm_properties so each facility
-- can have a photo that shows in the list, dashboard, and detail page.

ALTER TABLE fm_properties
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
