-- Add cover_type column to creations table
ALTER TABLE public.creations 
ADD COLUMN cover_type text NOT NULL DEFAULT 'eBook Cover';

-- Add check constraint to ensure valid cover types
ALTER TABLE public.creations 
ADD CONSTRAINT valid_cover_type 
CHECK (cover_type IN ('eBook Cover', 'Audiobook Cover', 'Album Cover'));