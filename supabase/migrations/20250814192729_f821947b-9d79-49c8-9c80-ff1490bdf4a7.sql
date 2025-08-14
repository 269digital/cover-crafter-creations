-- Create profile for the recent user and fix trigger permissions
INSERT INTO public.profiles (user_id, email, credits)
VALUES ('e29653b5-8def-4b63-bc78-0152d75cb51d', 'stellarstarlines@gmail.com', 2)
ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = now();

-- Grant necessary permissions for the trigger to work
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, UPDATE ON public.profiles TO supabase_auth_admin;

-- Recreate the trigger with proper permissions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();