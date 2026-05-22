
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any previous schedule with same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-nf-files-30d');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-nf-files-30d',
  '0 3 * * *',
  $$
  DELETE FROM storage.objects
  WHERE bucket_id = 'nf-files'
    AND created_at < now() - interval '30 days';
  $$
);
