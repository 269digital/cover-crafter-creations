-- Create storage bucket for upscaled covers
INSERT INTO storage.buckets (id, name, public) VALUES ('upscaled-covers', 'upscaled-covers', true);

-- Create storage policies for upscaled covers
CREATE POLICY "Users can view all upscaled covers" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'upscaled-covers');

CREATE POLICY "Authenticated users can upload upscaled covers" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'upscaled-covers' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own upscaled covers" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'upscaled-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add upscaled_image_url column to creations table to store the permanent URL
ALTER TABLE public.creations ADD COLUMN upscaled_image_url TEXT;

-- Add index for better performance when querying upscaled images
CREATE INDEX idx_creations_upscaled_image_url ON public.creations(upscaled_image_url) WHERE upscaled_image_url IS NOT NULL;