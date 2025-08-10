-- Make upscaled-covers bucket private and allow owner-only reads

-- Ensure bucket is private
UPDATE storage.buckets
SET public = false
WHERE id = 'upscaled-covers';

-- Allow authenticated users to read only their own files
DROP POLICY IF EXISTS "Users can view their own upscaled covers" ON storage.objects;
CREATE POLICY "Users can view their own upscaled covers"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'upscaled-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
