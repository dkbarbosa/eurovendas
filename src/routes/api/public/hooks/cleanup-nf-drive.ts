import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { listOldFilesInFolder, deleteDriveFile, NF_DRIVE_FOLDER_ID } from "@/lib/drive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Endpoint chamado pelo pg_cron diariamente.
// Apaga do Google Drive os arquivos da pasta de NFs com mais de 30 dias
// e limpa as referências em nf_requests.
//
// SEGURANÇA: exige header `X-Hook-Secret` igual ao secret CLEANUP_HOOK_SECRET,
// comparado em tempo constante. Sem o header válido, retorna 401 antes de
// qualquer operação destrutiva.
export const Route = createFileRoute("/api/public/hooks/cleanup-nf-drive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CLEANUP_HOOK_SECRET;
        if (!expected) {
          return new Response(
            JSON.stringify({ ok: false, error: "Server misconfigured: missing CLEANUP_HOOK_SECRET" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const provided = request.headers.get("x-hook-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        const valid = a.length === b.length && timingSafeEqual(a, b);
        if (!valid) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

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
