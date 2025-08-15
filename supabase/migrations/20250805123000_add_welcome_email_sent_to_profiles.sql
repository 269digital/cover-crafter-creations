-- Add column to track whether a welcome email has been sent
ALTER TABLE public.profiles ADD COLUMN welcome_email_sent BOOLEAN NOT NULL DEFAULT false;
