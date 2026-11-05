-- State database. Enable Supabase Cron (pg_cron) before running this migration.
-- Daily at 08:15 UTC / 03:15 Lima. Updates are idempotent within a day.
begin;
create extension if not exists pg_cron;
select cron.schedule('trencitos-statistics-nightly','15 8 * * *','select public.trencitos_refresh_statistics();');
commit;
