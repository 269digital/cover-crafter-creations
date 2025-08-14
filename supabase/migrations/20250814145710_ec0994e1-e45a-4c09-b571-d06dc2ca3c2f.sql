-- Update the existing handle_new_user function to also send a welcome email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert the user profile as before
  INSERT INTO public.profiles (user_id, email, credits)
  VALUES (NEW.id, NEW.email, 2)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();

  -- Send welcome email by calling the edge function
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := jsonb_build_object(
      'type', 'welcome',
      'to', NEW.email,
      'data', jsonb_build_object(
        'name', COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
      )
    )
  );

  RETURN NEW;
EXCEPTION 
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE LOG 'Failed to send welcome email for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure we have the necessary settings for the edge function calls
-- These will be set automatically by Supabase, but we ensure they exist
DO $$
BEGIN
  -- Set Supabase URL if not already set
  IF current_setting('app.supabase_url', true) IS NULL THEN
    PERFORM set_config('app.supabase_url', 'https://qasrsadhebdlwgxffkya.supabase.co', false);
  END IF;
  
  -- Set service role key placeholder (this will be automatically configured by Supabase)
  IF current_setting('app.supabase_service_role_key', true) IS NULL THEN
    PERFORM set_config('app.supabase_service_role_key', 'placeholder', false);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore any errors setting these configurations
  NULL;
END $$;