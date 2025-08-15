-- Ensure pg_net is available for HTTP calls from the database
create extension if not exists pg_net with schema extensions;

-- Update the signup trigger function to also send a welcome email via Edge Function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Insert or update the user profile with starter credits
  insert into public.profiles (user_id, email, credits)
  values (new.id, new.email, 2)
  on conflict (user_id) do update set
    email = excluded.email,
    updated_at = now();

  -- Try to send a welcome email (non-blocking). Any failure is logged and ignored.
  begin
    perform net.http_post(
      url := 'https://qasrsadhebdlwgxffkya.supabase.co/functions/v1/send-email',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := (
        jsonb_build_object(
          'type', 'welcome',
          'to', new.email,
          'data', jsonb_build_object(
            'name', coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
          )
        )
      )::text
    );
  exception when others then
    raise log 'handle_new_user welcome email failed for user %: %', new.id, sqlerrm;
  end;

  raise log 'Profile created for user %', new.id;
  return new;
exception when others then
  -- Log the error but still return NEW so signups never fail due to profile/email issues
  raise log 'Error in handle_new_user for user %: %', new.id, sqlerrm;
  return new;
end;
$$;