import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Role = "admin" | "diretor" | "gerente" | "corretor" | "financeiro";

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

    const roles = (rolesData ?? [])
      .map((item) => item.role as string)
      .filter((r): r is Role => r === "admin" || r === "diretor" || r === "gerente" || r === "corretor" || r === "financeiro");

    const mappingAtivo = mappingData?.ativo ?? false;
    let corretorNome = mappingAtivo ? mappingData?.corretor_nome ?? null : null;
    let gerenteNome = mappingAtivo ? mappingData?.gerente_nome ?? null : null;

    // Fallback: se o usuário tem role gerente/corretor mas o broker_mapping
    // não tem o nome preenchido, tenta resolver pelo display_name do profile
    // batendo com nomes distintos na planilha de vendas (case-insensitive).
    const needsGerenteResolve = roles.includes("gerente") && !gerenteNome;
    const needsCorretorResolve = roles.includes("corretor") && !corretorNome;
    if (needsGerenteResolve || needsCorretorResolve) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", context.userId)
        .maybeSingle();
      const displayName = (prof?.display_name ?? "").trim();
      if (displayName) {
        const dnNorm = displayName.toLowerCase();
        if (needsGerenteResolve) {
          const { data } = await supabaseAdmin
            .from("sales")
            .select("gerente")
            .ilike("gerente", displayName)
            .not("gerente", "is", null)
            .limit(1);
          const hit = (data ?? []).find((r) => (r.gerente ?? "").trim().toLowerCase() === dnNorm);
          if (hit?.gerente) {
            gerenteNome = hit.gerente;
            // Persiste para evitar nova resolução no futuro
            await supabaseAdmin
              .from("broker_mapping")
              .upsert(
                {
                  user_id: context.userId,
                  gerente_nome: hit.gerente,
                  corretor_nome: corretorNome,
                  ativo: true,
                },
                { onConflict: "user_id" },
              );
          }
        }
        if (needsCorretorResolve) {
          const { data } = await supabaseAdmin
            .from("sales")
            .select("corretor")
            .ilike("corretor", displayName)
            .not("corretor", "is", null)
            .limit(1);
          const hit = (data ?? []).find((r) => (r.corretor ?? "").trim().toLowerCase() === dnNorm);
          if (hit?.corretor) {
            corretorNome = hit.corretor;
            await supabaseAdmin
              .from("broker_mapping")
              .upsert(
                {
                  user_id: context.userId,
                  corretor_nome: hit.corretor,
                  gerente_nome: gerenteNome,
                  ativo: true,
                },
                { onConflict: "user_id" },
              );
          }
        }
      }
    }

    return { roles, corretorNome, gerenteNome };
  });
