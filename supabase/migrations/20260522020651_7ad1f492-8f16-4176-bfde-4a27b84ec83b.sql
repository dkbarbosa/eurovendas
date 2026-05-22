
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('cleanup-nf-files-30d'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('cleanup-nf-drive-30d'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cleanup-nf-drive-30d',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--7a96a12d-6e08-4387-b430-efb81cd9f886.lovable.app/api/public/hooks/cleanup-nf-drive',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
