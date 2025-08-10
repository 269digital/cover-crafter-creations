-- Tighten Storage RLS for upscaled-covers uploads and deletions

-- Drop overly-permissive insert policy
DROP POLICY IF EXISTS "Authenticated users can upload upscaled covers" ON storage.objects;

-- Restrict inserts to the caller's own user folder
CREATE POLICY "Authenticated users can upload their own upscaled covers"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'upscaled-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Ensure users can delete only their own files (missing previously)
DROP POLICY IF EXISTS "Users can delete their own upscaled covers" ON storage.objects;
CREATE POLICY "Users can delete their own upscaled covers"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'upscaled-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
