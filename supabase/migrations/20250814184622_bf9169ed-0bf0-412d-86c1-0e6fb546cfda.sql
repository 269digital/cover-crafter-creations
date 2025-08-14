-- Fix the handle_new_user function to create profiles without depending on email sending
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert the user profile first (this should always work)
  INSERT INTO public.profiles (user_id, email, credits)
  VALUES (NEW.id, NEW.email, 2)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();

  -- For now, skip the email sending since it requires service role key configuration
  -- This ensures profile creation always works
  RAISE LOG 'Profile created for user %', NEW.id;

  RETURN NEW;
EXCEPTION 
  WHEN OTHERS THEN
    -- Log the error but still try to return NEW so user creation doesn't fail
    RAISE LOG 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;