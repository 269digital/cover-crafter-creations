-- Add ideogram_id column to creations table for remix functionality
ALTER TABLE public.creations 
ADD COLUMN ideogram_id TEXT;