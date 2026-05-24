import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Role = "admin" | "gerente" | "corretor" | "financeiro";

export const getCurrentUserContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: rolesData, error: rolesError }, { data: mappingData, error: mappingError }] =
      await Promise.all([
        supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
        supabaseAdmin
          .from("broker_mapping")
          .select("corretor_nome,gerente_nome,ativo")
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);

    if (rolesError) throw new Error(rolesError.message);
    if (mappingError) throw new Error(mappingError.message);

    // Filtra "diretor" caso ainda exista historicamente — tratado como sem role.
    const roles = (rolesData ?? [])
      .map((item) => item.role as string)
      .filter((r): r is Role => r === "admin" || r === "gerente" || r === "corretor" || r === "financeiro");

    return {
      roles,
      corretorNome: mappingData?.ativo ? mappingData.corretor_nome ?? null : null,
      gerenteNome: mappingData?.ativo ? mappingData.gerente_nome ?? null : null,
    };
  });
