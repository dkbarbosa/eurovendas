import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Acesso negado: apenas administradores.");
}

export const listBrokerMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("broker_mapping").select("user_id,corretor_nome,gerente_nome,team_gerente_user_id,ativo,updated_at");
    return data ?? [];
  });

const SetMappingSchema = z.object({
  user_id: z.string().uuid(),
  corretor_nome: z.string().trim().min(1).max(200).nullable(),
  gerente_nome: z.string().trim().min(1).max(200).nullable().optional(),
});

export const setBrokerMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetMappingSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const corretor = data.corretor_nome ?? null;
    const gerente = data.gerente_nome ?? null;

    // Se ambos nulos, remove a row.
    if (!corretor && !gerente) {
      const { error } = await supabaseAdmin.from("broker_mapping").delete().eq("user_id", data.user_id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // Garante unicidade do corretor_nome (um corretor → um usuário)
    if (corretor) {
      const { data: existing } = await supabaseAdmin
        .from("broker_mapping").select("user_id").eq("corretor_nome", corretor).maybeSingle();
      if (existing && existing.user_id !== data.user_id)
        throw new Error("Este nome de corretor já está vinculado a outro usuário.");
    }

    const { error } = await supabaseAdmin
      .from("broker_mapping")
      .upsert({
        user_id: data.user_id,
        corretor_nome: corretor,
        gerente_nome: gerente,
        ativo: true,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
