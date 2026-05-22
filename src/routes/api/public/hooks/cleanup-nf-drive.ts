import { createFileRoute } from "@tanstack/react-router";
import { listOldFilesInFolder, deleteDriveFile, NF_DRIVE_FOLDER_ID } from "@/lib/drive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Endpoint público chamado pelo pg_cron diariamente.
// Apaga do Google Drive todos os arquivos da pasta de NFs com mais de 30 dias
// e limpa as referências em nf_requests.
export const Route = createFileRoute("/api/public/hooks/cleanup-nf-drive")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const files = await listOldFilesInFolder(NF_DRIVE_FOLDER_ID, 30);
          let deleted = 0;
          const errors: string[] = [];
          for (const f of files) {
            try {
              await deleteDriveFile(f.id);
              await supabaseAdmin
                .from("nf_requests")
                .update({ drive_file_id: null, arquivo_nf_url: null })
                .eq("drive_file_id", f.id);
              deleted++;
            } catch (e) {
              errors.push(`${f.id}: ${(e as Error).message}`);
            }
          }
          return new Response(JSON.stringify({ ok: true, scanned: files.length, deleted, errors }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
