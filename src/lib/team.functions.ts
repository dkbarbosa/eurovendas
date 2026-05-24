import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getRoles(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}

async function isCorretor(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "corretor")
    .maybeSingle();
  return !!data;
}

/** Gerente: lista corretores. `linked=true` = na minha equipe. `available=true` = pode ser adicionado. */
export const listMyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("gerente") && !roles.includes("admin")) {
      throw new Error("Acesso negado: apenas gerentes.");
    }

    // Todos os usuários com papel "corretor"
    const { data: corretorRoles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "corretor");
    const corretorIds = (corretorRoles ?? []).map((r) => r.user_id);
    if (corretorIds.length === 0) return [];

    const [{ data: profiles }, { data: mappings }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,email,display_name").in("id", corretorIds),
      supabaseAdmin.from("broker_mapping")
        .select("user_id,corretor_nome,team_gerente_user_id").in("user_id", corretorIds),
    ]);

    const mapByUser = new Map((mappings ?? []).map((m) => [m.user_id, m]));
    return (profiles ?? []).map((p) => {
      const m = mapByUser.get(p.id);
      const team = m?.team_gerente_user_id ?? null;
      return {
        user_id: p.id,
        email: p.email,
        display_name: p.display_name,
        corretor_nome: m?.corretor_nome ?? null,
        linked: team === context.userId,
        in_other_team: team !== null && team !== context.userId,
      };
    });
  });

const SetMemberSchema = z.object({
  corretor_user_id: z.string().uuid(),
  link: z.boolean(),
});

/** Gerente vincula/desvincula um corretor da SUA equipe. */
export const setTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetMemberSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    const isAdmin = roles.includes("admin");
    const isGer = roles.includes("gerente");
    if (!isAdmin && !isGer) throw new Error("Acesso negado.");

    if (!(await isCorretor(data.corretor_user_id))) {
      throw new Error("Usuário alvo não é um corretor.");
    }

    // Carrega vínculo atual
    const { data: existing } = await supabaseAdmin
      .from("broker_mapping").select("user_id,team_gerente_user_id")
      .eq("user_id", data.corretor_user_id).maybeSingle();

    if (data.link) {
      // Gerente só pode vincular se estiver livre (admin pode sobrescrever)
      if (!isAdmin && existing?.team_gerente_user_id && existing.team_gerente_user_id !== context.userId) {
        throw new Error("Corretor já está em outra equipe.");
      }
      if (existing) {
        const { error } = await supabaseAdmin.from("broker_mapping")
          .update({ team_gerente_user_id: context.userId })
          .eq("user_id", data.corretor_user_id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseAdmin.from("broker_mapping")
          .insert({ user_id: data.corretor_user_id, team_gerente_user_id: context.userId, ativo: true });
        if (error) throw new Error(error.message);
      }
    } else {
      // Desvincular: gerente só desvincula da própria equipe
      if (!isAdmin && existing?.team_gerente_user_id !== context.userId) {
        throw new Error("Corretor não pertence à sua equipe.");
      }
      if (existing) {
        const { error } = await supabaseAdmin.from("broker_mapping")
          .update({ team_gerente_user_id: null })
          .eq("user_id", data.corretor_user_id);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

const AdminSetGerenteSchema = z.object({
  corretor_user_id: z.string().uuid(),
  gerente_user_id: z.string().uuid().nullable(),
});

/** Admin: define direto qual gerente atende um corretor (ou nenhum). */
export const adminSetCorretorGerente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminSetGerenteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.userId);
    if (!roles.includes("admin")) throw new Error("Acesso negado.");

    const { data: existing } = await supabaseAdmin
      .from("broker_mapping").select("user_id").eq("user_id", data.corretor_user_id).maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin.from("broker_mapping")
        .update({ team_gerente_user_id: data.gerente_user_id })
        .eq("user_id", data.corretor_user_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("broker_mapping")
        .insert({ user_id: data.corretor_user_id, team_gerente_user_id: data.gerente_user_id, ativo: true });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
