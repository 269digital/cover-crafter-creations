-- Remove pg_net extension from public schema since it should be in extensions schema
-- This fixes the security linter warning about extension in public schema
drop extension if exists pg_net cascade;