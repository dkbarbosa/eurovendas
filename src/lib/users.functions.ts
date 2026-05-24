import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Role = "admin" | "gerente" | "corretor" | "financeiro";

const RoleSchema = z.enum(["admin", "gerente", "corretor", "financeiro"]);


const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(254),
  password: z
    .string()
    .min(8, "Senha precisa de no mínimo 8 caracteres")
    .max(128, "Senha muito longa"),
  displayName: z.string().trim().min(1, "Nome obrigatório").max(120),
  role: RoleSchema,
});

const SetRoleSchema = z.object({
  userId: z.string().uuid("ID de usuário inválido"),
  role: RoleSchema,
  enable: z.boolean(),
});

const DeleteUserSchema = z.object({
  userId: z.string().uuid("ID de usuário inválido"),
});

const ChangePwSchema = z.object({
  userId: z.string().uuid("ID de usuário inválido"),
  password: z.string().min(8, "Senha precisa de no mínimo 8 caracteres").max(128),
});


async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado: apenas administradores.");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,email,display_name,created_at")
      .order("created_at", { ascending: true });
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");
    const map = new Map<string, Role[]>();
    for (const r of roles ?? []) {
      const arr = map.get(r.user_id) ?? [];
      arr.push(r.role as Role);
      map.set(r.user_id, arr);
    }
    return (profiles ?? []).map((p) => ({ ...p, roles: map.get(p.id) ?? [] }));
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; displayName: string; role: Role }) =>
    InviteSchema.parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, email: data.email, display_name: data.displayName });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: uid, role: data.role }, { onConflict: "user_id,role" });
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: Role; enable: boolean }) => SetRoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.enable) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => DeleteUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin altera a senha de qualquer usuário, sem enviar e-mail. */
export const adminChangeUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => ChangePwSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
